#!/usr/bin/env node
/**
 * Authoritative deterministic package builder for releases.
 *
 * Recreates only the three known ignored TypeScript output directories, builds,
 * establishes canonical archive modes, packs all public workspaces, verifies the
 * npm file manifest, and writes release-manifest.json last. Workspace prepack
 * hooks refuse raw `npm pack` / `npm publish` calls that bypass this path.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
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
const buildOutputRoots = [
  "packages/core/dist",
  "packages/adapters/dist",
  "packages/cli/dist",
];
const packages = [
  { workspace: "@skill-harness/core", directory: "packages/core", archivePrefix: "skill-harness-core" },
  { workspace: "@skill-harness/adapters", directory: "packages/adapters", archivePrefix: "skill-harness-adapters" },
  { workspace: "@skill-harness/cli", directory: "packages/cli", archivePrefix: "skill-harness-cli" },
  { workspace: "skill-harness", directory: "packages/skill-harness", archivePrefix: "skill-harness" },
];
const stagingDirectories = [
  { source: "schemas", destination: "packages/core/schemas", files: null },
  {
    source: "assets",
    destination: "packages/cli/assets",
    files: ["report.template.html", "report.grade.js"],
  },
];
const stagingFiles = [
  "packages/core/LICENSE",
  "packages/adapters/LICENSE",
  "packages/cli/LICENSE",
  "packages/skill-harness/LICENSE",
];
const markerPathEnv = "SKILL_HARNESS_RELEASE_PACK_MARKER";
const markerNonceEnv = "SKILL_HARNESS_RELEASE_PACK_NONCE";

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

function runNpm(cwd, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync("npm", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) fail(`could not run npm ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) {
    const output = capture ? `\n${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    fail(`npm ${args.join(" ")} exited ${result.status}${output}`);
  }
  return result.stdout ?? "";
}

function modeString(mode) {
  return (mode & 0o777).toString(8).padStart(4, "0");
}

function assertReleaseToolchain(root) {
  if (process.version !== requiredNodeVersion) {
    fail(`release packaging requires Node ${requiredNodeVersion.slice(1)}; running ${process.version.slice(1)}`);
  }
  const npmVersion = runNpm(root, ["--version"], { capture: true }).trim();
  if (npmVersion !== requiredNpmVersion) {
    fail(`release packaging requires npm ${requiredNpmVersion}; running ${npmVersion}`);
  }
}

async function prepareCanonicalBuildOutputs(root) {
  // Inspect every ignored path touched below before deleting or copying. A link,
  // device, or FIFO is a refusal, not something release preparation follows.
  for (const relativeRoot of buildOutputRoots) assertSafeDirectoryTree(join(root, relativeRoot));
  for (const { source, destination, files } of stagingDirectories) {
    assertSafeDirectoryTree(join(root, source), { required: true });
    assertSafeDirectoryTree(join(root, destination));
    if (files) for (const file of files) assertRegularFile(join(root, source, file));
  }
  assertRegularFile(join(root, "LICENSE"));
  for (const relativeFile of stagingFiles) assertRegularFileIfPresent(join(root, relativeFile));

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
      mkdirSync(destinationPath, { recursive: true });
      for (const file of files) copyFileSync(join(sourcePath, file), join(destinationPath, file));
    } else {
      cpSync(sourcePath, destinationPath, { recursive: true });
    }
  }
  for (const relativeFile of stagingFiles) copyFileSync(join(root, "LICENSE"), join(root, relativeFile));

  const cli = join(root, canonicalCliRelative);
  assertRegularFile(cli, canonicalCliRelative);
  const contentBefore = createHash("sha256").update(readFileSync(cli)).digest("hex");
  chmodSync(cli, canonicalCliMode);
  const contentAfter = createHash("sha256").update(readFileSync(cli)).digest("hex");
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

function invalidateCompletionManifest(output) {
  const outputStat = lstatIfPresent(output);
  if (!outputStat) return;
  if (outputStat.isSymbolicLink()) fail(`${output} is a symbolic link`);
  if (!outputStat.isDirectory()) fail(`${output} is not a directory`);
  const manifest = join(output, "release-manifest.json");
  if (lstatIfPresent(manifest)) {
    assertRegularFile(manifest, manifest);
    unlinkSync(manifest);
  }
}

function prepareOutputDirectory(output, expectedNames) {
  const outputStat = lstatIfPresent(output);
  if (!outputStat) {
    mkdirSync(output, { recursive: true });
    return;
  }
  if (outputStat.isSymbolicLink()) fail(`${output} is a symbolic link`);
  if (!outputStat.isDirectory()) fail(`${output} is not a directory`);

  const allowed = new Set(expectedNames);
  const entries = readdirSync(output);
  for (const name of entries) {
    if (!allowed.has(name)) fail(`${output} contains unexpected entry ${name}; refusing broad cleanup`);
    assertRegularFile(join(output, name), join(output, name));
  }
  for (const name of entries) unlinkSync(join(output, name));
}

function canonicalTargetPath(path) {
  const suffix = [];
  let ancestor = path;
  while (!lstatIfPresent(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) fail(`cannot resolve output path ${path}`);
    suffix.unshift(basename(ancestor));
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}

function assertOutputSeparated(output) {
  const canonicalOutput = canonicalTargetPath(output);
  const canonicalRepo = realpathSync(repoRoot);
  const canonicalDefault = join(canonicalRepo, "release-artifacts");
  const insideRepo = canonicalOutput === canonicalRepo || canonicalOutput.startsWith(`${canonicalRepo}${sep}`);
  if (insideRepo && canonicalOutput !== canonicalDefault) {
    fail(`output directory ${output} overlaps managed repository paths; use release-artifacts/ or a directory outside the checkout`);
  }
  return canonicalOutput;
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tarEntry(archive, wantedPath) {
  const tar = gunzipSync(readFileSync(archive));
  const field = (offset, length) => tar.subarray(offset, offset + length).toString("utf8").replace(/\0.*$/, "").trim();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = field(offset, 100);
    const prefix = field(offset + 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(field(offset + 124, 12) || "0", 8);
    const mode = Number.parseInt(field(offset + 100, 8) || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(mode)) fail(`${archive} has a malformed tar header`);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (contentEnd > tar.length) fail(`${archive} has a truncated tar entry ${path}`);
    if (path === wantedPath) return { mode, content: tar.subarray(contentStart, contentEnd) };
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  fail(`${archive} is missing ${wantedPath}`);
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
    if (args.length !== 2 || args[0] !== "--output" || !args[1]) {
      fail("usage: npm run release:pack -- [--output <directory>]");
    }
    output = isAbsolute(args[1]) ? args[1] : resolve(repoRoot, args[1]);
  }

  assertOutputSeparated(output);
  // For every authorized output location, invalidate the completion marker before
  // package metadata, toolchain, tree inspection, or build checks can fail.
  invalidateCompletionManifest(output);

  const packageVersions = packages.map((entry) => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, entry.directory, "package.json"), "utf8"));
    if (manifest.name !== entry.workspace || typeof manifest.version !== "string") {
      fail(`${entry.directory}/package.json has unexpected package identity`);
    }
    return { ...entry, version: manifest.version, filename: `${entry.archivePrefix}-${manifest.version}.tgz` };
  });
  const rootVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
  if (packageVersions.some(({ version }) => version !== rootVersion)) fail("workspace versions are not in lockstep");

  prepareOutputDirectory(output, packageVersions.map(({ filename }) => filename));
  assertReleaseToolchain(repoRoot);
  await prepareCanonicalBuildOutputs(repoRoot);

  const marker = createGuardMarker();
  const packEnv = {
    ...process.env,
    [markerPathEnv]: marker.path,
    [markerNonceEnv]: marker.nonce,
  };
  const artifacts = [];
  try {
    for (const pkg of packageVersions) {
      const stdout = runNpm(repoRoot, [
        "pack", "-w", pkg.workspace, "--pack-destination", output, "--json", "--silent",
      ], { capture: true, env: packEnv });
      const packed = parsePackJson(stdout, pkg.workspace);
      if (packed.filename !== pkg.filename) fail(`${pkg.workspace} produced ${packed.filename}; expected ${pkg.filename}`);
      const archive = join(output, packed.filename);
      assertRegularFile(archive, archive);
      const files = Array.isArray(packed.files) ? packed.files.map(({ path, size, mode }) => ({ path, size, mode })) : [];
      if (pkg.workspace === "@skill-harness/cli") {
        const cliEntry = files.find((file) => file.path === "dist/cli.js");
        if (!cliEntry) fail("@skill-harness/cli archive is missing dist/cli.js");
        if (cliEntry.mode !== canonicalCliMode) {
          fail(`@skill-harness/cli dist/cli.js archive mode is ${modeString(cliEntry.mode)}; expected 0644`);
        }
        const archivedCli = tarEntry(archive, "package/dist/cli.js");
        if (archivedCli.mode !== canonicalCliMode) {
          fail(`@skill-harness/cli dist/cli.js tar mode is ${modeString(archivedCli.mode)}; expected 0644`);
        }
        if (!archivedCli.content.equals(readFileSync(join(repoRoot, canonicalCliRelative)))) {
          fail("@skill-harness/cli dist/cli.js archive content differs from the canonical build output");
        }
      }
      artifacts.push({
        package: pkg.workspace,
        version: pkg.version,
        filename: packed.filename,
        sha256: sha256(archive),
        size: lstatSync(archive).size,
        files,
      });
    }
  } finally {
    rmSync(marker.directory, { recursive: true, force: true });
  }

  const manifest = {
    schema: 1,
    version: rootVersion,
    canonical_modes: { [canonicalCliRelative]: "0644" },
    artifacts,
  };
  // Written last: its presence means every archive and canonical mode above was verified.
  writeFileSync(join(output, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644, flag: "wx" });
  for (const artifact of artifacts) console.log(`${artifact.sha256}  ${artifact.filename}`);
  console.log(`verified release artifacts → ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
