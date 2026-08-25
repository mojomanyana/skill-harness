#!/usr/bin/env node
/**
 * Authoritative deterministic package builder for releases.
 *
 * Recreates only known generated outputs, validates every package input without
 * following links, compares the source inventory with npm's dry-run metadata and
 * the actual tar bytes, and writes a source/toolchain-bound manifest last.
 *
 * This is validation against a still filesystem, not OS containment. Another
 * process able to rename path components concurrently can race lstat-based checks;
 * release preparation therefore requires an otherwise quiescent checkout.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalCliRelative = "packages/cli/dist/cli.js";
const canonicalCliMode = 0o644;
const requiredNodeVersion = "v20.20.2";
const requiredNpmVersion = "10.8.2";
const completionManifestName = "release-manifest.json";
const pendingManifestName = "release-manifest.json.tmp";
const buildOutputRoots = [
  "packages/core/dist",
  "packages/adapters/dist",
  "packages/cli/dist",
];
const packages = [
  {
    workspace: "@skill-harness/core",
    directory: "packages/core",
    archivePrefix: "skill-harness-core",
    staticFiles: ["package.json", "README.md", "LICENSE"],
    internalDependencies: [],
    inventoryRoots: [
      { path: "dist", accepts: (path) => path.endsWith(".js") || path.endsWith(".d.ts"), ignores: (path) => path === ".tsbuildinfo" || path.endsWith(".map"), pairedDeclarations: true },
      { path: "schemas", accepts: (path) => path.endsWith(".json") },
    ],
  },
  {
    workspace: "@skill-harness/adapters",
    directory: "packages/adapters",
    archivePrefix: "skill-harness-adapters",
    staticFiles: ["package.json", "README.md", "LICENSE"],
    internalDependencies: ["@skill-harness/core"],
    inventoryRoots: [
      { path: "dist", accepts: (path) => path.endsWith(".js") || path.endsWith(".d.ts"), ignores: (path) => path === ".tsbuildinfo" || path.endsWith(".map"), pairedDeclarations: true },
    ],
  },
  {
    workspace: "@skill-harness/cli",
    directory: "packages/cli",
    archivePrefix: "skill-harness-cli",
    staticFiles: ["package.json", "README.md", "LICENSE"],
    internalDependencies: ["@skill-harness/core", "@skill-harness/adapters"],
    inventoryRoots: [
      { path: "dist", accepts: (path) => path.endsWith(".js") || path.endsWith(".d.ts"), ignores: (path) => path === ".tsbuildinfo" || path.endsWith(".map"), pairedDeclarations: true },
      { path: "assets", exact: ["report.grade.js", "report.template.html"] },
    ],
  },
  {
    workspace: "skill-harness",
    directory: "packages/skill-harness",
    archivePrefix: "skill-harness",
    staticFiles: ["package.json", "README.md", "LICENSE", "bin.js"],
    internalDependencies: ["@skill-harness/cli"],
    inventoryRoots: [],
    modes: { "bin.js": 0o755 },
  },
];
const stagingDirectories = [
  { source: "schemas", destination: "packages/core/schemas", files: null },
  { source: "assets", destination: "packages/cli/assets", files: ["report.template.html", "report.grade.js"] },
];
const stagingFiles = [
  "packages/core/LICENSE",
  "packages/adapters/LICENSE",
  "packages/cli/LICENSE",
  "packages/skill-harness/LICENSE",
];
const markerPathEnv = "SKILL_HARNESS_RELEASE_PACK_MARKER";
const markerNonceEnv = "SKILL_HARNESS_RELEASE_PACK_NONCE";
let failureCleanup;

function fail(message) {
  throw new Error(`release-pack: ${message}`);
}

function displayPath(path) {
  const rel = relative(repoRoot, path);
  return rel && !rel.startsWith("..") ? rel.replaceAll("\\", "/") : path;
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    fail(`${displayPath(path)} could not be inspected: ${error.message}`);
  }
}

function assertRegularFile(path, label = displayPath(path)) {
  const stat = lstatIfPresent(path);
  if (!stat) fail(`${label} is missing`);
  if (stat.isSymbolicLink()) fail(`${label} is a symbolic link; refusing to follow it`);
  if (!stat.isFile()) fail(`${label} is not a regular file`);
  return stat;
}

function assertDirectory(path, label = displayPath(path)) {
  const stat = lstatIfPresent(path);
  if (!stat) fail(`${label} is missing`);
  if (stat.isSymbolicLink()) fail(`${label} is a symbolic link; refusing to follow it`);
  if (!stat.isDirectory()) fail(`${label} is not a directory`);
  return stat;
}

function assertSafeDirectoryTree(path, { required = false } = {}) {
  const rootStat = lstatIfPresent(path);
  if (!rootStat) {
    if (required) fail(`${displayPath(path)} is missing`);
    return;
  }
  if (rootStat.isSymbolicLink()) fail(`${displayPath(path)} is a symbolic link; refusing to remove it`);
  if (!rootStat.isDirectory()) fail(`${displayPath(path)} is not a directory`);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    const stat = lstatSync(child);
    if (stat.isSymbolicLink()) fail(`${displayPath(child)} is a symbolic link; refusing to follow or remove it`);
    if (stat.isDirectory()) assertSafeDirectoryTree(child, { required: true });
    else if (!stat.isFile()) fail(`${displayPath(child)} is not a regular file`);
  }
}

function assertRegularFileIfPresent(path) {
  if (lstatIfPresent(path)) assertRegularFile(path);
}

function pathComponents(path) {
  const components = [];
  let current = resolve(path);
  for (;;) {
    components.unshift(current);
    const parent = dirname(current);
    if (parent === current) return components;
    current = parent;
  }
}

function assertManagedPathComponents(path, { finalType, allowMissing = false } = {}) {
  const absolute = resolve(path);
  const rel = relative(repoRoot, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) fail(`${absolute} escapes the repository`);
  const components = rel.split(sep).filter(Boolean);
  let current = repoRoot;
  assertDirectory(repoRoot, repoRoot);
  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    const stat = lstatIfPresent(current);
    const final = index === components.length - 1;
    if (!stat) {
      if (allowMissing) return;
      fail(`${displayPath(current)} is missing`);
    }
    if (stat.isSymbolicLink()) fail(`${displayPath(current)} is a symbolic link; refusing to follow it`);
    if (!final || finalType === "directory") {
      if (!stat.isDirectory()) fail(`${displayPath(current)} is not a directory`);
    } else if (finalType === "file" && !stat.isFile()) {
      fail(`${displayPath(current)} is not a regular file`);
    }
  }
}

/** Validate every existing output component without following links. */
function inspectOutputPath(path) {
  const absolute = resolve(path);
  const components = pathComponents(absolute);
  let missing = false;
  let lastExisting = components[0];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const stat = lstatIfPresent(component);
    if (!stat) {
      missing = true;
      continue;
    }
    if (missing) fail(`output path ${absolute} changed while it was inspected`);
    if (stat.isSymbolicLink()) fail(`output path component ${component} is a symbolic link; refusing to follow it`);
    if (!stat.isDirectory()) fail(`output path component ${component} is not a directory`);
    lastExisting = component;
  }
  const suffix = relative(lastExisting, absolute).split(sep).filter(Boolean);
  return {
    absolute,
    canonical: resolve(realpathSync(lastExisting), ...suffix),
    exists: Boolean(lstatIfPresent(absolute)),
  };
}

function assertOutputSeparated(output) {
  const inspected = inspectOutputPath(output);
  const canonicalRepo = realpathSync(repoRoot);
  const canonicalDefault = join(canonicalRepo, "release-artifacts");
  const insideRepo = inspected.canonical === canonicalRepo || inspected.canonical.startsWith(`${canonicalRepo}${sep}`);
  if (insideRepo && inspected.canonical !== canonicalDefault) {
    fail(`output directory ${output} overlaps managed repository paths; use release-artifacts/ or a directory outside the checkout`);
  }
  return inspected;
}

function createOutputDirectory(inspected) {
  if (!inspected.exists) {
    let parentExists = true;
    for (const component of pathComponents(inspected.absolute)) {
      const stat = lstatIfPresent(component);
      if (stat) {
        if (!parentExists) fail(`output path ${inspected.absolute} changed while it was created`);
        if (stat.isSymbolicLink()) fail(`output path component ${component} is a symbolic link; refusing to follow it`);
        if (!stat.isDirectory()) fail(`output path component ${component} is not a directory`);
        continue;
      }
      parentExists = false;
      try {
        mkdirSync(component);
      } catch (error) {
        if (error?.code !== "EEXIST") fail(`could not create output directory ${component}: ${error.message}`);
      }
      const created = lstatIfPresent(component);
      if (!created || created.isSymbolicLink() || !created.isDirectory()) {
        fail(`new output path component ${component} is not a regular directory`);
      }
      parentExists = true;
    }
  }
  const verified = assertOutputSeparated(inspected.absolute);
  if (!verified.exists || realpathSync(verified.absolute) !== inspected.canonical) {
    fail(`output directory ${inspected.absolute} changed identity while it was created`);
  }
  return verified;
}

function runCommand(command, args, { cwd = repoRoot, capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) fail(`could not run ${command} ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) {
    const output = capture ? `\n${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    fail(`${command} ${args.join(" ")} exited ${result.status}${output}`);
  }
  return result.stdout ?? "";
}

function runNpm(cwd, args, options = {}) {
  return runCommand("npm", args, { cwd, ...options });
}

function runGit(args, { env = process.env } = {}) {
  return runCommand("git", args, { capture: true, env }).trim();
}

function runGitRaw(args, { env = process.env } = {}) {
  return runCommand("git", args, { capture: true, env });
}

function modeString(mode) {
  return mode.toString(8).padStart(4, "0");
}

function assertReleaseToolchain(root) {
  if (process.version !== requiredNodeVersion) {
    fail(`release packaging requires Node ${requiredNodeVersion.slice(1)}; running ${process.version.slice(1)}`);
  }
  const npmVersion = runNpm(root, ["--version"], { capture: true }).trim();
  if (npmVersion !== requiredNpmVersion) {
    fail(`release packaging requires npm ${requiredNpmVersion}; running ${npmVersion}`);
  }
  const ignoreScripts = runNpm(root, ["config", "get", "ignore-scripts"], { capture: true }).trim();
  if (ignoreScripts !== "false") {
    fail(`release packaging requires npm lifecycle scripts; ignore-scripts is ${ignoreScripts || "unset"}`);
  }
  return npmVersion;
}

function committedSourceIdentity() {
  const commit = runGit(["rev-parse", "HEAD"]);
  const tree = runGit(["rev-parse", "HEAD^{tree}"]);
  let rootManifest;
  try {
    rootManifest = JSON.parse(runGit(["show", `${commit}:package.json`]));
  } catch (error) {
    fail(`committed package.json is unreadable: ${error.message}`);
  }
  if (typeof rootManifest.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(rootManifest.version)) {
    fail(`committed package.json has unsafe version ${JSON.stringify(rootManifest.version)}`);
  }
  return { commit, tree, version: rootManifest.version };
}

function artifactFilename(prefix, version) {
  if (!/^[a-z0-9-]+$/.test(prefix)) fail(`unsafe archive prefix ${prefix}`);
  const filename = `${prefix}-${version}.tgz`;
  if (basename(filename) !== filename || filename.includes("/") || filename.includes("\\")) fail(`unsafe archive filename ${filename}`);
  return filename;
}

function artifactPath(output, filename) {
  const path = resolve(output, filename);
  if (dirname(path) !== resolve(output) || basename(path) !== filename) fail(`archive path ${filename} escapes the output directory`);
  return path;
}

function workingSourceTree() {
  const directory = mkdtempSync(join(tmpdir(), "skill-harness-release-index-"));
  const index = join(directory, "index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    runGit(["read-tree", "HEAD"], { env });
    runGit(["add", "-A"], { env });
    return runGit(["write-tree"], { env });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertCleanSource(identity) {
  const currentCommit = runGit(["rev-parse", "HEAD"]);
  const currentTree = runGit(["rev-parse", "HEAD^{tree}"]);
  if (currentCommit !== identity.commit || currentTree !== identity.tree) {
    fail(`source identity changed during release preparation; expected ${identity.commit}/${identity.tree}, got ${currentCommit}/${currentTree}`);
  }
  const flagged = runGitRaw(["ls-files", "-v"]).split("\n").filter((line) => /^[a-zS] /.test(line));
  if (flagged.length > 0) fail(`tracked source uses hidden index flags: ${flagged.slice(0, 8).map((line) => line.slice(2)).join(", ")}`);
  const actualTree = workingSourceTree();
  if (actualTree !== identity.tree) {
    const dirty = runGitRaw(["status", "--porcelain=v1", "--untracked-files=all"]).trimEnd();
    const paths = dirty ? dirty.split("\n").slice(0, 8).map((line) => line.slice(3)).join(", ") : "working bytes differ from HEAD";
    fail(`tracked source differs from recorded tree ${identity.tree}: ${paths}`);
  }
}

function assertStaticPackageInputs() {
  assertManagedPathComponents(join(repoRoot, "package.json"), { finalType: "file" });
  for (const pkg of packages) {
    const packageRoot = join(repoRoot, pkg.directory);
    assertManagedPathComponents(packageRoot, { finalType: "directory" });
    for (const file of pkg.staticFiles.filter((name) => name !== "LICENSE")) {
      const path = join(packageRoot, file);
      assertManagedPathComponents(path, { finalType: "file" });
      assertRegularFile(path, `${pkg.directory}/${file}`);
    }
  }
}

async function prepareCanonicalBuildOutputs(root) {
  for (const relativeRoot of buildOutputRoots) {
    assertManagedPathComponents(join(root, relativeRoot), { finalType: "directory", allowMissing: true });
    assertSafeDirectoryTree(join(root, relativeRoot));
  }
  for (const { source, destination, files } of stagingDirectories) {
    assertManagedPathComponents(join(root, source), { finalType: "directory" });
    assertManagedPathComponents(join(root, destination), { finalType: "directory", allowMissing: true });
    assertSafeDirectoryTree(join(root, source), { required: true });
    assertSafeDirectoryTree(join(root, destination));
    if (files) for (const file of files) assertRegularFile(join(root, source, file));
  }
  assertManagedPathComponents(join(root, "LICENSE"), { finalType: "file" });
  assertRegularFile(join(root, "LICENSE"));
  for (const relativeFile of stagingFiles) {
    assertManagedPathComponents(join(root, relativeFile), { finalType: "file", allowMissing: true });
    assertRegularFileIfPresent(join(root, relativeFile));
  }

  for (const relativeRoot of [...buildOutputRoots, ...stagingDirectories.map(({ destination }) => destination)]) {
    rmSync(join(root, relativeRoot), { recursive: true, force: true });
  }
  for (const relativeFile of stagingFiles) {
    const path = join(root, relativeFile);
    if (lstatIfPresent(path)) unlinkSync(path);
  }

  runNpm(root, ["run", "build"]);

  for (const { source, destination, files } of stagingDirectories) {
    const sourcePath = join(root, source);
    const destinationPath = join(root, destination);
    if (files) {
      mkdirSync(destinationPath);
      for (const file of files) copyFileSync(join(sourcePath, file), join(destinationPath, file));
    } else {
      cpSync(sourcePath, destinationPath, { recursive: true });
    }
  }
  for (const relativeFile of stagingFiles) copyFileSync(join(root, "LICENSE"), join(root, relativeFile));

  const cli = join(root, canonicalCliRelative);
  assertRegularFile(cli, canonicalCliRelative);
  const contentBefore = sha256Bytes(readFileSync(cli));
  chmodSync(cli, canonicalCliMode);
  const contentAfter = sha256Bytes(readFileSync(cli));
  if (contentAfter !== contentBefore) fail(`${canonicalCliRelative} content changed while establishing its mode`);
  const actualMode = lstatSync(cli).mode & 0o777;
  if (actualMode !== canonicalCliMode) {
    fail(`${canonicalCliRelative} canonical mode is ${modeString(actualMode)}; expected 0644`);
  }
}

function createGuardMarker() {
  const directory = mkdtempSync(join(tmpdir(), "skill-harness-release-pack-"));
  const path = join(directory, "authorization.json");
  const nonce = randomBytes(24).toString("hex");
  writeFileSync(path, `${JSON.stringify({ repoRoot, nonce })}\n`, { mode: 0o600, flag: "wx" });
  return { directory, path, nonce };
}

function requireReleasePackGuard() {
  const path = process.env[markerPathEnv];
  const nonce = process.env[markerNonceEnv];
  if (!path || !nonce) {
    fail("raw workspace pack/publish is not authorized; run `npm run release:pack` from the repository root");
  }
  assertRegularFile(path, "release authorization marker");
  let marker;
  try {
    marker = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`release authorization marker is unreadable: ${error.message}`);
  }
  if (marker.repoRoot !== repoRoot || marker.nonce !== nonce) fail("release authorization marker does not match this checkout");
}

function unlinkExactOutputEntry(path) {
  const stat = lstatIfPresent(path);
  if (!stat) return { hostile: false };
  if (stat.isDirectory()) fail(`${path} is a directory; refusing recursive cleanup`);
  const hostile = stat.isSymbolicLink() || !stat.isFile();
  unlinkSync(path); // unlink the exact directory entry; never follow a link target
  return { hostile };
}

function invalidateCompletionManifest(output) {
  const outputStat = lstatIfPresent(output);
  if (!outputStat) return;
  assertDirectory(output, output);
  let hostile = false;
  for (const name of [completionManifestName, pendingManifestName]) {
    const result = unlinkExactOutputEntry(join(output, name));
    hostile ||= result.hostile;
  }
  if (hostile) fail(`${output} contained a non-regular completion marker; it was unlinked without following it`);
}

function cleanupFailedOutput(output, expectedNames) {
  const inspected = inspectOutputPath(output);
  if (!inspected.exists) return;
  const errors = [];
  for (const name of [...expectedNames, completionManifestName, pendingManifestName]) {
    try {
      unlinkExactOutputEntry(artifactPath(inspected.absolute, name));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0) fail(`could not remove every failed output: ${errors.join("; ")}`);
}

function prepareOutputDirectory(inspected, expectedNames) {
  const verified = createOutputDirectory(inspected);
  const allowed = new Set(expectedNames);
  const entries = readdirSync(verified.absolute);
  for (const name of entries) {
    if (!allowed.has(name)) fail(`${verified.absolute} contains unexpected entry ${name}; refusing broad cleanup`);
    assertRegularFile(join(verified.absolute, name), join(verified.absolute, name));
  }
  for (const name of entries) unlinkSync(join(verified.absolute, name));
  return verified;
}

function parsePackJson(stdout, workspace) {
  const start = stdout.indexOf("[");
  if (start < 0) fail(`${workspace} npm pack did not return JSON`);
  let parsed;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch (error) {
    fail(`${workspace} npm pack returned malformed JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) fail(`${workspace} npm pack returned an unexpected result count`);
  return parsed[0];
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256(path) {
  return sha256Bytes(readFileSync(path));
}

function walkInventory(root, relativeRoot, descriptor, entries) {
  const absoluteRoot = join(root, relativeRoot);
  assertManagedPathComponents(absoluteRoot, { finalType: "directory" });
  assertDirectory(absoluteRoot);
  const exact = descriptor.exact ? new Set(descriptor.exact) : undefined;
  const ignored = descriptor.ignores ?? (() => false);
  const foundExact = new Set();
  function visit(directory, relativeDirectory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail(`${displayPath(path)} is a symbolic link; refusing to package it`);
      if (stat.isDirectory()) {
        visit(path, relativePath);
        continue;
      }
      if (!stat.isFile()) fail(`${displayPath(path)} is not a regular file`);
      if (ignored(relativePath)) continue;
      if (exact) {
        if (!exact.has(relativePath)) fail(`${displayPath(path)} is an unexpected package input`);
        foundExact.add(relativePath);
      } else if (!descriptor.accepts(relativePath)) {
        fail(`${displayPath(path)} is an unexpected package input`);
      }
      entries.push(`${relativeRoot}/${relativePath}`);
    }
  }
  visit(absoluteRoot, "");
  if (entries.filter((path) => path.startsWith(`${relativeRoot}/`)).length === 0) fail(`${displayPath(absoluteRoot)} contains no package files`);
  if (exact) {
    for (const expected of exact) if (!foundExact.has(expected)) fail(`${displayPath(join(absoluteRoot, expected))} is missing`);
  }
}

function collectExpectedInventory(pkg) {
  const packageRoot = join(repoRoot, pkg.directory);
  assertManagedPathComponents(packageRoot, { finalType: "directory" });
  assertDirectory(packageRoot);
  const relativeFiles = [...pkg.staticFiles];
  for (const descriptor of pkg.inventoryRoots) walkInventory(packageRoot, descriptor.path, descriptor, relativeFiles);
  const unique = new Set(relativeFiles);
  if (unique.size !== relativeFiles.length) fail(`${pkg.workspace} expected inventory contains duplicate paths`);

  for (const descriptor of pkg.inventoryRoots.filter((entry) => entry.pairedDeclarations)) {
    const scoped = relativeFiles.filter((path) => path.startsWith(`${descriptor.path}/`));
    const names = new Set(scoped);
    for (const path of scoped) {
      const pair = path.endsWith(".d.ts") ? `${path.slice(0, -5)}.js` : path.endsWith(".js") ? `${path.slice(0, -3)}.d.ts` : undefined;
      if (pair && !names.has(pair)) fail(`${pkg.directory}/${pair} is missing; JavaScript and declaration outputs must be paired`);
    }
  }

  const inventory = new Map();
  for (const path of [...unique].sort()) {
    const absolute = join(packageRoot, path);
    const stat = assertRegularFile(absolute, `${pkg.directory}/${path}`);
    const content = readFileSync(absolute);
    inventory.set(path, {
      path,
      absolute,
      size: stat.size,
      mode: pkg.modes?.[path] ?? 0o644,
      content,
      sha256: sha256Bytes(content),
    });
  }
  return inventory;
}

function normalizeNpmFiles(packed, pkg, phase) {
  if (packed.name !== pkg.workspace || packed.version !== pkg.version || packed.filename !== pkg.filename) {
    fail(`${pkg.workspace} ${phase} metadata has unexpected package identity or filename`);
  }
  if (!Array.isArray(packed.files)) fail(`${pkg.workspace} ${phase} metadata has no file inventory`);
  const files = new Map();
  for (const entry of packed.files) {
    if (typeof entry.path !== "string" || !entry.path || entry.path.startsWith("/") || entry.path.split("/").includes("..")) {
      fail(`${pkg.workspace} ${phase} metadata contains unsafe path ${JSON.stringify(entry.path)}`);
    }
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) {
      fail(`${pkg.workspace} ${phase} metadata for ${entry.path} has invalid size or mode`);
    }
    if (files.has(entry.path)) fail(`${pkg.workspace} ${phase} metadata repeats ${entry.path}`);
    files.set(entry.path, { path: entry.path, size: entry.size, mode: entry.mode });
  }
  return files;
}

function compareInventory(label, actual, expected) {
  const actualPaths = [...actual.keys()].sort();
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const unexpected = actualPaths.filter((path) => !expected.has(path));
    const missing = expectedPaths.filter((path) => !actual.has(path));
    fail(`${label} inventory mismatch: unexpected ${unexpected.join(", ") || "none"}; missing ${missing.join(", ") || "none"}`);
  }
  for (const path of expectedPaths) {
    const received = actual.get(path);
    const wanted = expected.get(path);
    if (received.size !== wanted.size || received.mode !== wanted.mode) {
      fail(`${label} metadata mismatch for ${path}: size/mode ${received.size}/${modeString(received.mode)}, expected ${wanted.size}/${modeString(wanted.mode)}`);
    }
  }
}

function parseOctal(header, offset, length, label) {
  const raw = header.subarray(offset, offset + length).toString("ascii").replace(/\0.*$/, "").trim();
  if (!/^[0-7]+$/.test(raw)) fail(`${label} has malformed octal field`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} has out-of-range octal field`);
  return value;
}

function inspectTarArchive(archive, expected, archiveBytes = readFileSync(archive)) {
  const tar = gunzipSync(archiveBytes);
  const files = new Map();
  const directories = new Map();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks >= 2) break;
      continue;
    }
    if (zeroBlocks > 0) fail(`${archive} has data after a tar zero block`);
    const storedChecksum = parseOctal(header, 148, 8, archive);
    let computedChecksum = 0;
    for (let index = 0; index < header.length; index += 1) computedChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
    if (storedChecksum !== computedChecksum) fail(`${archive} has an invalid tar header checksum`);

    const field = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/, "");
    const name = field(0, 100);
    const prefix = field(345, 155);
    const tarPath = prefix ? `${prefix}/${name}` : name;
    const size = parseOctal(header, 124, 12, `${archive}:${tarPath}`);
    const mode = parseOctal(header, 100, 8, `${archive}:${tarPath}`);
    if (mode > 0o777) fail(`${archive} entry ${tarPath} carries unsupported special mode bits ${modeString(mode)}`);
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
    if (!tarPath.startsWith("package/")) fail(`${archive} contains path outside package/: ${tarPath}`);
    const path = tarPath.slice("package/".length).replace(/\/$/, "");
    if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
      fail(`${archive} contains unsafe tar path ${tarPath}`);
    }
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (contentEnd > tar.length) fail(`${archive} has a truncated tar entry ${tarPath}`);
    if (type === "5") {
      if (size !== 0) fail(`${archive} directory ${tarPath} has content`);
      if (mode !== 0o755) fail(`${archive} directory ${tarPath} has mode ${modeString(mode)}; expected 0755`);
      if (directories.has(path)) fail(`${archive} repeats directory entry ${tarPath}`);
      directories.set(path, mode);
    } else if (type === "0") {
      if (files.has(path)) fail(`${archive} repeats tar entry ${tarPath}`);
      files.set(path, { path, size, mode, content: tar.subarray(contentStart, contentEnd) });
    } else {
      fail(`${archive} entry ${tarPath} has unsupported type ${JSON.stringify(type)}; only regular files and directories are allowed`);
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  if (zeroBlocks < 2 || !tar.subarray(offset).every((byte) => byte === 0)) fail(`${archive} has an invalid tar trailer`);

  compareInventory(`${basename(archive)} tar`, files, expected);
  const allowedDirectories = new Set();
  for (const path of expected.keys()) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) allowedDirectories.add(parts.slice(0, index).join("/"));
  }
  for (const path of directories.keys()) if (!allowedDirectories.has(path)) fail(`${archive} contains unexpected directory ${path}`);
  for (const [path, wanted] of expected) {
    const actual = files.get(path);
    if (!actual.content.equals(wanted.content)) fail(`${archive} archived bytes differ from source input ${path}`);
  }
  return files;
}

function assertInventorySourcesUnchanged(pkg, inventory) {
  for (const [path, entry] of inventory) {
    const stat = assertRegularFile(entry.absolute, `${pkg.directory}/${path}`);
    if (stat.size !== entry.size || sha256(entry.absolute) !== entry.sha256) {
      fail(`${pkg.directory}/${path} changed after its package inventory was captured`);
    }
  }
}

function writeManifestAtomic(output, manifest) {
  const pending = join(output, pendingManifestName);
  const final = join(output, completionManifestName);
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const fd = openSync(pending, "wx", 0o644);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(pending, final);
  assertRegularFile(final, final);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--guard") {
    requireReleasePackGuard();
    return;
  }
  if (resolve(process.cwd()) !== repoRoot) fail("run this command from the repository root");

  let output = join(repoRoot, "release-artifacts");
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== "--output" || !args[1]) fail("usage: npm run release:pack -- [--output <directory>]");
    output = isAbsolute(args[1]) ? resolve(args[1]) : resolve(repoRoot, args[1]);
  }

  const inspectedOutput = assertOutputSeparated(output);
  const source = committedSourceIdentity();
  const expectedArchiveNames = packages.map((pkg) => artifactFilename(pkg.archivePrefix, source.version));
  for (const name of expectedArchiveNames) artifactPath(inspectedOutput.absolute, name);
  failureCleanup = { output: inspectedOutput.absolute, expectedNames: expectedArchiveNames };
  invalidateCompletionManifest(inspectedOutput.absolute);
  const verifiedOutput = prepareOutputDirectory(inspectedOutput, expectedArchiveNames);
  const npmVersion = assertReleaseToolchain(repoRoot);
  assertStaticPackageInputs();
  assertCleanSource(source);

  const packageVersions = packages.map((entry) => {
    const path = join(repoRoot, entry.directory, "package.json");
    assertManagedPathComponents(path, { finalType: "file" });
    assertRegularFile(path, `${entry.directory}/package.json`);
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (manifest.name !== entry.workspace || manifest.version !== source.version) {
      fail(`${entry.directory}/package.json has unexpected package identity or version`);
    }
    const scriptEntries = Object.entries(manifest.scripts ?? {});
    if (scriptEntries.length !== 1 || scriptEntries[0][0] !== "prepack" || scriptEntries[0][1] !== "node ../../scripts/release-pack.mjs --guard") {
      fail(`${entry.directory}/package.json must declare only the authorized prepack guard lifecycle`);
    }
    const internal = Object.entries(manifest.dependencies ?? {}).filter(([name]) => name.startsWith("@skill-harness/"));
    const expectedInternal = [...entry.internalDependencies].sort();
    if (JSON.stringify(internal.map(([name]) => name).sort()) !== JSON.stringify(expectedInternal)
      || internal.some(([, version]) => version !== source.version)) {
      fail(`${entry.directory}/package.json has invalid internal dependency pins`);
    }
    return { ...entry, version: manifest.version, filename: artifactFilename(entry.archivePrefix, manifest.version) };
  });

  await prepareCanonicalBuildOutputs(repoRoot);
  assertCleanSource(source);

  const marker = createGuardMarker();
  const packEnv = { ...process.env, [markerPathEnv]: marker.path, [markerNonceEnv]: marker.nonce };
  const artifacts = [];
  const capturedInventories = new Map();
  try {
    for (const pkg of packageVersions) {
      assertOutputSeparated(verifiedOutput.absolute);
      const expected = collectExpectedInventory(pkg);
      capturedInventories.set(pkg.workspace, expected);

      const plannedStdout = runNpm(repoRoot, [
        "pack", "-w", pkg.workspace, "--pack-destination", verifiedOutput.absolute, "--json", "--silent", "--dry-run",
      ], { capture: true, env: packEnv });
      const planned = parsePackJson(plannedStdout, pkg.workspace);
      const plannedFiles = normalizeNpmFiles(planned, pkg, "dry-run");
      compareInventory(`${pkg.workspace} npm dry-run`, plannedFiles, expected);
      if (lstatIfPresent(artifactPath(verifiedOutput.absolute, pkg.filename))) fail(`${pkg.workspace} dry-run unexpectedly retained an archive`);

      const stdout = runNpm(repoRoot, [
        "pack", "-w", pkg.workspace, "--pack-destination", verifiedOutput.absolute, "--json", "--silent",
      ], { capture: true, env: packEnv });
      const packed = parsePackJson(stdout, pkg.workspace);
      const packedFiles = normalizeNpmFiles(packed, pkg, "pack");
      compareInventory(`${pkg.workspace} npm pack`, packedFiles, expected);
      compareInventory(`${pkg.workspace} npm dry-run/pack`, packedFiles, plannedFiles);

      const archive = artifactPath(verifiedOutput.absolute, pkg.filename);
      assertRegularFile(archive, archive);
      const tarFiles = inspectTarArchive(archive, expected);
      assertInventorySourcesUnchanged(pkg, expected);
      artifacts.push({
        package: pkg.workspace,
        version: pkg.version,
        filename: pkg.filename,
        sha256: "",
        size: 0,
        files: [...tarFiles.values()].map(({ path, size, mode }) => ({ path, size, mode })).sort((left, right) => left.path.localeCompare(right.path)),
      });
    }
  } finally {
    rmSync(marker.directory, { recursive: true, force: true });
  }

  assertCleanSource(source);
  for (const pkg of packageVersions) assertInventorySourcesUnchanged(pkg, capturedInventories.get(pkg.workspace));
  const finalOutput = assertOutputSeparated(verifiedOutput.absolute);
  if (realpathSync(finalOutput.absolute) !== verifiedOutput.canonical) fail("output directory changed identity before manifest completion");
  const retained = readdirSync(finalOutput.absolute).sort();
  if (JSON.stringify(retained) !== JSON.stringify([...expectedArchiveNames].sort())) {
    fail(`retained release inventory changed before manifest completion: ${retained.join(", ")}`);
  }
  const finalArchiveBytes = new Map();
  for (const artifact of artifacts) {
    const archive = artifactPath(finalOutput.absolute, artifact.filename);
    const stat = assertRegularFile(archive, archive);
    const bytes = readFileSync(archive);
    if (stat.size !== bytes.length) fail(`${archive} changed size while final bytes were read`);
    finalArchiveBytes.set(artifact.package, { archive, bytes });
  }
  for (const artifact of artifacts) {
    const { archive, bytes } = finalArchiveBytes.get(artifact.package);
    const expected = capturedInventories.get(artifact.package);
    const tarFiles = inspectTarArchive(archive, expected, bytes);
    artifact.files = [...tarFiles.values()].map(({ path, size, mode }) => ({ path, size, mode })).sort((left, right) => left.path.localeCompare(right.path));
    artifact.size = bytes.length;
    artifact.sha256 = sha256Bytes(bytes);
  }

  const manifest = {
    schema: 2,
    completion: "complete",
    source: { commit: source.commit, tree: source.tree },
    toolchain: { node: process.version, npm: npmVersion },
    version: source.version,
    creation_order: artifacts.map(({ filename }) => filename),
    canonical_modes: { [canonicalCliRelative]: "0644" },
    artifacts,
  };
  writeManifestAtomic(finalOutput.absolute, manifest);
  failureCleanup = undefined;
  for (const artifact of artifacts) console.log(`${artifact.sha256}  ${artifact.filename}`);
  console.log(`verified release artifacts → ${finalOutput.absolute}`);
}

main().catch((error) => {
  let cleanupError;
  if (failureCleanup) {
    try {
      cleanupFailedOutput(failureCleanup.output, failureCleanup.expectedNames);
    } catch (caught) {
      cleanupError = caught;
    }
  }
  console.error(error instanceof Error ? error.message : String(error));
  if (cleanupError) console.error(`release-pack: failed-output cleanup also failed: ${cleanupError.message ?? String(cleanupError)}`);
  process.exit(1);
});
