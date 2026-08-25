import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), "skill-harness-release-pack-test-"));
const CLI_OUTPUT = join("packages", "cli", "dist", "cli.js");
const MANIFEST = "release-manifest.json";
const CANONICAL_MODE = 0o644;
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "release-pack-test",
  GIT_AUTHOR_EMAIL: "release-pack-test@example.invalid",
  GIT_COMMITTER_NAME: "release-pack-test",
  GIT_COMMITTER_EMAIL: "release-pack-test@example.invalid",
  GIT_AUTHOR_DATE: "2026-08-24T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-08-24T00:00:00Z",
};

interface ReleaseManifest {
  source: { commit: string; tree: string };
  toolchain: { node: string; npm: string };
  canonical_modes: Record<string, string>;
  artifacts: Array<{
    package: string;
    filename: string;
    sha256: string;
    files: Array<{ path: string; mode: number }>;
  }>;
}

function cloneRepo(label: string): string {
  const destination = join(TMP, label);
  cpSync(REPO, destination, {
    recursive: true,
    filter(source) {
      const rel = relative(REPO, source).replaceAll("\\", "/");
      if (!rel) return true;
      if (rel === ".git" || rel.startsWith(".git/")) return false;
      if (rel === "node_modules" || rel.startsWith("node_modules/")) return false;
      if (rel === "release-artifacts" || rel.startsWith("release-artifacts/")) return false;
      if (rel.endsWith(".tsbuildinfo")) return false;
      if (/^packages\/(core|adapters|cli)\/dist(?:\/|$)/.test(rel)) return false;
      return true;
    },
  });
  symlinkSync(join(REPO, "node_modules"), join(destination, "node_modules"), "dir");
  for (const args of [["init", "-q"], ["add", "-A"], ["commit", "-qm", "fixture"]]) {
    const result = spawnSync("git", args, { cwd: destination, encoding: "utf8", env: GIT_ENV });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return destination;
}

function commitPaths(root: string, paths: string[], message = "mutation"): void {
  for (const args of [["add", "--", ...paths], ["commit", "-qm", message]]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: GIT_ENV });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function runReleasePack(root: string, output = join(root, "release-artifacts")) {
  const result = spawnSync(process.execPath, [join(root, "scripts", "release-pack.mjs"), "--output", output], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return { ...result, output, combined: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function requireSuccess(result: ReturnType<typeof runReleasePack>): void {
  expect(result.status, result.combined).toBe(0);
}

function readManifest(root: string): ReleaseManifest {
  return JSON.parse(readFileSync(join(root, "release-artifacts", MANIFEST), "utf8")) as ReleaseManifest;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function mode(path: string): number {
  return lstatSync(path).mode & 0o777;
}

function artifactBytes(root: string, manifest: ReleaseManifest): Map<string, Buffer> {
  return new Map(manifest.artifacts.map((artifact) => [
    artifact.filename,
    readFileSync(join(root, "release-artifacts", artifact.filename)),
  ]));
}

function tarEntry(archive: string, wantedPath: string): { mode: number; content: Buffer } {
  const tar = gunzipSync(readFileSync(archive));
  const field = (offset: number, length: number) => tar.subarray(offset, offset + length).toString("utf8").replace(/\0.*$/, "").trim();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = field(offset, 100);
    const prefix = field(offset + 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(field(offset + 124, 12) || "0", 8);
    const entryMode = Number.parseInt(field(offset + 100, 8) || "0", 8);
    const contentStart = offset + 512;
    if (path === wantedPath) return { mode: entryMode, content: tar.subarray(contentStart, contentStart + size) };
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${archive} is missing ${wantedPath}`);
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("authoritative release packaging", () => {
  it("builds absent outputs, records digests, and packs cli.js as canonical 0644", () => {
    const root = cloneRepo("clean");
    expect(existsSync(join(root, CLI_OUTPUT))).toBe(false);

    const result = runReleasePack(root);
    requireSuccess(result);

    expect(mode(join(root, CLI_OUTPUT))).toBe(CANONICAL_MODE);
    const manifest = readManifest(root);
    expect(manifest.source).toEqual({
      commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
      tree: spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    });
    expect(manifest.toolchain).toEqual({ node: process.version, npm: "10.8.2" });
    expect(manifest.canonical_modes[CLI_OUTPUT]).toBe("0644");
    expect(manifest.artifacts).toHaveLength(4);
    for (const artifact of manifest.artifacts) {
      expect(artifact.sha256).toBe(sha256(join(root, "release-artifacts", artifact.filename)));
    }
    const cli = manifest.artifacts.find((artifact) => artifact.package === "@skill-harness/cli")!;
    expect(cli.files.find((file) => file.path === "dist/cli.js")?.mode).toBe(CANONICAL_MODE);
    const archivedCli = tarEntry(join(root, "release-artifacts", cli.filename), "package/dist/cli.js");
    expect(archivedCli.mode).toBe(CANONICAL_MODE);
    expect(archivedCli.content).toEqual(readFileSync(join(root, CLI_OUTPUT)));
  }, 60_000);

  it("turns a reused 0755 cli.js into the byte-identical clean 0644 archive", () => {
    const clean = cloneRepo("reused-clean-reference");
    const cleanResult = runReleasePack(clean);
    requireSuccess(cleanResult);
    const cleanManifest = readManifest(clean);
    const cleanCli = readFileSync(join(clean, CLI_OUTPUT));
    const cleanArtifacts = artifactBytes(clean, cleanManifest);

    const reused = cloneRepo("reused-seeded");
    const reusedCli = join(reused, CLI_OUTPUT);
    mkdirSync(dirname(reusedCli), { recursive: true });
    writeFileSync(reusedCli, cleanCli);
    chmodSync(reusedCli, 0o755);
    expect(mode(reusedCli)).toBe(0o755);
    expect(readFileSync(reusedCli)).toEqual(cleanCli);

    const reusedResult = runReleasePack(reused);
    requireSuccess(reusedResult);
    expect(mode(reusedCli)).toBe(CANONICAL_MODE);
    expect(readFileSync(reusedCli)).toEqual(cleanCli);

    const reusedManifest = readManifest(reused);
    expect(reusedManifest.artifacts.map(({ filename, sha256: digest }) => ({ filename, digest })))
      .toEqual(cleanManifest.artifacts.map(({ filename, sha256: digest }) => ({ filename, digest })));
    for (const [filename, bytes] of cleanArtifacts) {
      expect(readFileSync(join(reused, "release-artifacts", filename)), filename).toEqual(bytes);
    }
  }, 90_000);

  it("accepts safe external outputs and rejects non-directory ancestors", () => {
    const absoluteRoot = cloneRepo("absolute-external-output");
    const absoluteOutput = join(TMP, "safe-absolute-output");
    const absoluteResult = runReleasePack(absoluteRoot, absoluteOutput);
    requireSuccess(absoluteResult);
    expect(existsSync(join(absoluteOutput, MANIFEST))).toBe(true);

    const relativeRoot = cloneRepo("relative-external-output");
    const relativeOutput = join("..", "safe-relative-output");
    const relativeResult = runReleasePack(relativeRoot, relativeOutput);
    requireSuccess(relativeResult);
    expect(existsSync(join(dirname(relativeRoot), "safe-relative-output", MANIFEST))).toBe(true);

    const blockedRoot = cloneRepo("non-directory-output-ancestor");
    const blockingFile = join(blockedRoot, "not-a-directory");
    writeFileSync(blockingFile, "sentinel\n");
    const blockedResult = runReleasePack(blockedRoot, join(blockingFile, "release"));
    expect(blockedResult.status).not.toBe(0);
    expect(blockedResult.combined).toMatch(/output path component .* is not a directory/i);
    expect(readFileSync(blockingFile, "utf8")).toBe("sentinel\n");
    expect(existsSync(join(blockingFile, "release", MANIFEST))).toBe(false);
  }, 60_000);

  it("rejects output symlinks at any depth without touching external targets", () => {
    for (const shape of ["direct", "ancestor", "chained", "dangling"] as const) {
      const root = cloneRepo(`output-link-${shape}`);
      const external = join(TMP, `output-link-${shape}-external`);
      mkdirSync(external);
      writeFileSync(join(external, "sentinel"), "outside stays unchanged\n");
      let output: string;
      if (shape === "direct") {
        output = join(root, "linked-output");
        symlinkSync(external, output, "dir");
      } else if (shape === "ancestor") {
        const parent = join(root, "output-parent");
        mkdirSync(parent);
        symlinkSync(external, join(parent, "link"), "dir");
        output = join(parent, "link", "release");
      } else if (shape === "chained") {
        const first = join(root, "first-link");
        const second = join(root, "second-link");
        symlinkSync(second, first, "dir");
        symlinkSync(external, second, "dir");
        output = join(first, "release");
      } else {
        const dangling = join(root, "dangling-link");
        symlinkSync(join(TMP, "does-not-exist"), dangling, "dir");
        output = join(dangling, "release");
      }

      const result = runReleasePack(root, output);
      expect(result.status, `${shape}: ${result.combined}`).not.toBe(0);
      expect(result.combined, shape).toMatch(/symbolic link/i);
      expect(readFileSync(join(external, "sentinel"), "utf8"), shape).toBe("outside stays unchanged\n");
      expect(readdirSync(external), shape).toEqual(["sentinel"]);
      expect(existsSync(join(output, MANIFEST)), shape).toBe(false);
    }
  }, 30_000);

  it("rejects symlinked or missing public package inputs without following external targets", () => {
    const cases = [
      { label: "package-json-link", path: join("packages", "core", "package.json"), kind: "link" },
      { label: "readme-link", path: join("packages", "core", "README.md"), kind: "link" },
      { label: "readme-missing", path: join("packages", "core", "README.md"), kind: "missing" },
    ] as const;
    for (const probe of cases) {
      const root = cloneRepo(probe.label);
      const input = join(root, probe.path);
      const original = readFileSync(input);
      rmSync(input);
      const external = join(TMP, `${probe.label}-external`);
      writeFileSync(external, original);
      if (probe.kind === "link") symlinkSync(external, input);

      const result = runReleasePack(root);
      expect(result.status, `${probe.label}: ${result.combined}`).not.toBe(0);
      expect(result.combined, probe.label).toMatch(/package\.json|README\.md/i);
      expect(readFileSync(external), probe.label).toEqual(original);
      expect(existsSync(join(result.output, MANIFEST)), probe.label).toBe(false);
      expect(existsSync(join(result.output, "skill-harness-core-0.11.0.tgz")), probe.label).toBe(false);
    }
  }, 30_000);

  it("rejects FIFO and symlinked LICENSE package inputs without changing external targets", () => {
    const fifoRoot = cloneRepo("readme-fifo");
    const fifoReadme = join(fifoRoot, "packages", "core", "README.md");
    rmSync(fifoReadme);
    const fifo = spawnSync("mkfifo", [fifoReadme], { encoding: "utf8" });
    expect(fifo.status, fifo.stderr).toBe(0);
    const fifoResult = runReleasePack(fifoRoot);
    expect(fifoResult.status).not.toBe(0);
    expect(fifoResult.combined).toMatch(/README\.md.*not a regular file/i);
    expect(existsSync(join(fifoRoot, "release-artifacts", MANIFEST))).toBe(false);

    const licenseRoot = cloneRepo("license-link");
    const license = join(licenseRoot, "packages", "core", "LICENSE");
    const external = join(TMP, "license-link-external");
    writeFileSync(external, "external license remains unchanged\n");
    rmSync(license, { force: true });
    symlinkSync(external, license);
    const licenseResult = runReleasePack(licenseRoot);
    expect(licenseResult.status).not.toBe(0);
    expect(licenseResult.combined).toMatch(/packages\/core\/LICENSE.*symbolic link/i);
    expect(readFileSync(external, "utf8")).toBe("external license remains unchanged\n");
    expect(existsSync(join(licenseRoot, "release-artifacts", MANIFEST))).toBe(false);
  }, 30_000);

  it("rejects a hostile cli.js symlink without following or changing its target", () => {
    const root = cloneRepo("hostile-symlink");
    const target = join(TMP, "outside-target.js");
    const cli = join(root, CLI_OUTPUT);
    mkdirSync(dirname(cli), { recursive: true });
    writeFileSync(target, "outside must remain untouched\n");
    symlinkSync(target, cli);
    const staleOutput = join(root, "release-artifacts");
    mkdirSync(staleOutput);
    writeFileSync(join(staleOutput, MANIFEST), "stale manifest must be invalidated\n");

    const result = runReleasePack(root);
    expect(result.status).not.toBe(0);
    expect(result.combined).toMatch(/cli\.js.*symbolic link|symbolic link.*cli\.js/i);
    expect(lstatSync(cli).isSymbolicLink()).toBe(true);
    expect(resolve(dirname(cli), readlinkSync(cli))).toBe(target);
    expect(readFileSync(target, "utf8")).toBe("outside must remain untouched\n");
    expect(existsSync(join(result.output, MANIFEST))).toBe(false);
  }, 30_000);

  it("rejects hostile prepack staging paths without modifying their targets", () => {
    const root = cloneRepo("hostile-staging-symlink");
    const target = join(TMP, "outside-license.txt");
    const stagedLicense = join(root, "packages", "cli", "LICENSE");
    rmSync(stagedLicense, { force: true });
    writeFileSync(target, "outside license must remain untouched\n");
    symlinkSync(target, stagedLicense);

    const result = runReleasePack(root);
    expect(result.status).not.toBe(0);
    expect(result.combined).toMatch(/packages\/cli\/LICENSE.*symbolic link/i);
    expect(lstatSync(stagedLicense).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("outside license must remain untouched\n");
    expect(existsSync(join(result.output, MANIFEST))).toBe(false);
  }, 30_000);

  it("invalidates stale manifests before refusing unexpected or overlapping output paths", () => {
    const stale = cloneRepo("stale-output-manifest");
    const staleOutput = join(stale, "release-artifacts");
    mkdirSync(staleOutput);
    writeFileSync(join(staleOutput, MANIFEST), "stale\n");
    writeFileSync(join(staleOutput, "unexpected.txt"), "keep me\n");
    const staleResult = runReleasePack(stale);
    expect(staleResult.status).not.toBe(0);
    expect(staleResult.combined).toMatch(/unexpected entry unexpected\.txt/i);
    expect(existsSync(join(staleOutput, MANIFEST))).toBe(false);
    expect(readFileSync(join(staleOutput, "unexpected.txt"), "utf8")).toBe("keep me\n");

    const wrongToolchain = cloneRepo("stale-manifest-toolchain-refusal");
    const wrongOutput = join(wrongToolchain, "release-artifacts");
    mkdirSync(wrongOutput);
    writeFileSync(join(wrongOutput, MANIFEST), "stale\n");
    const wrongScript = join(wrongToolchain, "scripts", "release-pack.mjs");
    const wrongSource = readFileSync(wrongScript, "utf8");
    expect(wrongSource).toContain('const requiredNodeVersion = "v20.20.2";');
    writeFileSync(wrongScript, wrongSource.replace('const requiredNodeVersion = "v20.20.2";', 'const requiredNodeVersion = "v0.0.0";'));
    const wrongResult = runReleasePack(wrongToolchain);
    expect(wrongResult.status).not.toBe(0);
    expect(wrongResult.combined).toMatch(/release packaging requires Node 0\.0\.0/i);
    expect(existsSync(join(wrongOutput, MANIFEST))).toBe(false);

    const wrongNpm = cloneRepo("stale-manifest-npm-refusal");
    const wrongNpmOutput = join(wrongNpm, "release-artifacts");
    mkdirSync(wrongNpmOutput);
    writeFileSync(join(wrongNpmOutput, MANIFEST), "stale\n");
    const wrongNpmScript = join(wrongNpm, "scripts", "release-pack.mjs");
    const wrongNpmSource = readFileSync(wrongNpmScript, "utf8");
    expect(wrongNpmSource).toContain('const requiredNpmVersion = "10.8.2";');
    writeFileSync(wrongNpmScript, wrongNpmSource.replace('const requiredNpmVersion = "10.8.2";', 'const requiredNpmVersion = "0.0.0";'));
    const wrongNpmResult = runReleasePack(wrongNpm);
    expect(wrongNpmResult.status).not.toBe(0);
    expect(wrongNpmResult.combined).toMatch(/release packaging requires npm 0\.0\.0/i);
    expect(existsSync(join(wrongNpmOutput, MANIFEST))).toBe(false);

    const overlap = cloneRepo("overlapping-output");
    const overlapOutput = join(overlap, "packages", "cli", "dist");
    const overlapResult = runReleasePack(overlap, overlapOutput);
    expect(overlapResult.status).not.toBe(0);
    expect(overlapResult.combined).toMatch(/output directory .* overlaps managed repository paths/i);
    expect(existsSync(join(overlapOutput, MANIFEST))).toBe(false);

    const alias = join(TMP, "overlap-repo-alias");
    symlinkSync(overlap, alias, "dir");
    const aliasOutput = join(alias, "packages", "cli", "dist");
    const aliasResult = runReleasePack(overlap, aliasOutput);
    expect(aliasResult.status).not.toBe(0);
    expect(aliasResult.combined).toMatch(/overlaps managed repository paths|symbolic link/i);
    expect(existsSync(join(overlapOutput, MANIFEST))).toBe(false);
  }, 30_000);

  it("rejects missing declarations and npm inventory drift", () => {
    const missingDeclaration = cloneRepo("missing-declaration");
    const declarationScript = join(missingDeclaration, "scripts", "release-pack.mjs");
    const declarationSource = readFileSync(declarationScript, "utf8");
    const preparation = "await prepareCanonicalBuildOutputs(repoRoot);";
    expect(declarationSource.split(preparation)).toHaveLength(2);
    writeFileSync(declarationScript, declarationSource.replace(
      preparation,
      `${preparation}\n  unlinkSync(join(repoRoot, "packages/core/dist/index.d.ts")); // mutation: declaration missing`,
    ));
    commitPaths(missingDeclaration, ["scripts/release-pack.mjs"]);
    const declarationResult = runReleasePack(missingDeclaration);
    expect(declarationResult.status).not.toBe(0);
    expect(declarationResult.combined).toMatch(/dist\/index\.d\.ts is missing|JavaScript and declaration outputs must be paired/i);
    expect(existsSync(join(declarationResult.output, MANIFEST))).toBe(false);
    expect(readdirSync(declarationResult.output)).toEqual([]);

    const unexpected = cloneRepo("unexpected-npm-file");
    const unexpectedManifestPath = join(unexpected, "packages", "core", "package.json");
    const unexpectedManifest = JSON.parse(readFileSync(unexpectedManifestPath, "utf8"));
    unexpectedManifest.files.push("surprise.txt");
    writeFileSync(unexpectedManifestPath, `${JSON.stringify(unexpectedManifest, null, 4)}\n`);
    writeFileSync(join(unexpected, "packages", "core", "surprise.txt"), "must not ship\n");
    commitPaths(unexpected, ["packages/core/package.json", "packages/core/surprise.txt"]);
    const unexpectedResult = runReleasePack(unexpected);
    expect(unexpectedResult.status).not.toBe(0);
    expect(unexpectedResult.combined).toMatch(/npm dry-run inventory mismatch.*unexpected surprise\.txt/i);
    expect(existsSync(join(unexpectedResult.output, MANIFEST))).toBe(false);
    expect(readdirSync(unexpectedResult.output)).toEqual([]);

    const missing = cloneRepo("missing-npm-file");
    const missingManifestPath = join(missing, "packages", "core", "package.json");
    const missingManifest = JSON.parse(readFileSync(missingManifestPath, "utf8"));
    missingManifest.files = missingManifest.files.filter((entry: string) => entry !== "dist/**/*.d.ts");
    writeFileSync(missingManifestPath, `${JSON.stringify(missingManifest, null, 4)}\n`);
    commitPaths(missing, ["packages/core/package.json"]);
    const missingResult = runReleasePack(missing);
    expect(missingResult.status).not.toBe(0);
    expect(missingResult.combined).toMatch(/npm dry-run inventory mismatch.*missing dist\//i);
    expect(existsSync(join(missingResult.output, MANIFEST))).toBe(false);
    expect(readdirSync(missingResult.output)).toEqual([]);
  }, 90_000);

  it("rejects an actual tar inventory mutation after npm metadata agrees", () => {
    const root = cloneRepo("tar-inventory-mutation");
    const script = join(root, "scripts", "release-pack.mjs");
    let source = readFileSync(script, "utf8");
    source = source.replace(
      'import { gunzipSync } from "node:zlib";',
      'import { gzipSync, gunzipSync } from "node:zlib";',
    );
    const needle = "assertRegularFile(archive, archive);\n      const tarFiles = inspectTarArchive(archive, expected);";
    expect(source.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    const mutation = `assertRegularFile(archive, archive);\n      if (pkg.workspace === "@skill-harness/core") {\n        const mutatedTar = gunzipSync(readFileSync(archive));\n        const originalName = Buffer.from("package/README.md");\n        const replacementName = Buffer.from("package/SURPRISE.");\n        const headerOffset = mutatedTar.indexOf(originalName);\n        if (headerOffset < 0) throw new Error("mutation could not find README header");\n        replacementName.copy(mutatedTar, headerOffset);\n        const blockOffset = Math.floor(headerOffset / 512) * 512;\n        mutatedTar.fill(0x20, blockOffset + 148, blockOffset + 156);\n        let checksum = 0;\n        for (let i = 0; i < 512; i += 1) checksum += mutatedTar[blockOffset + i];\n        Buffer.from(checksum.toString(8).padStart(6, "0") + "\\0 ").copy(mutatedTar, blockOffset + 148);\n        writeFileSync(archive, gzipSync(mutatedTar, { mtime: 0 }));\n      }\n      const tarFiles = inspectTarArchive(archive, expected);`;
    writeFileSync(script, source.replace(needle, mutation));
    commitPaths(root, ["scripts/release-pack.mjs"]);

    const result = runReleasePack(root);
    expect(result.status).not.toBe(0);
    expect(result.combined).toMatch(/tar inventory mismatch.*unexpected SURPRISE\..*missing README\.md/i);
    expect(existsSync(join(result.output, MANIFEST))).toBe(false);
    expect(readdirSync(result.output)).toEqual([]);
  }, 60_000);

  it("binds and replaces stale source/toolchain manifests, and detects later archive mutation", () => {
    const root = cloneRepo("manifest-binding");
    const output = join(root, "release-artifacts");
    mkdirSync(output);
    writeFileSync(join(output, MANIFEST), `${JSON.stringify({
      schema: 2,
      completion: "complete",
      source: { commit: "0".repeat(40), tree: "1".repeat(40) },
      toolchain: { node: "v0.0.0", npm: "0.0.0" },
    })}\n`);
    for (const name of [
      "skill-harness-core-0.11.0.tgz",
      "skill-harness-adapters-0.11.0.tgz",
      "skill-harness-cli-0.11.0.tgz",
      "skill-harness-0.11.0.tgz",
    ]) writeFileSync(join(output, name), "stale archive\n");

    const result = runReleasePack(root);
    requireSuccess(result);
    const manifest = readManifest(root);
    expect(manifest.source.commit).not.toBe("0".repeat(40));
    expect(manifest.source.tree).not.toBe("1".repeat(40));
    expect(manifest.toolchain).toEqual({ node: process.version, npm: "10.8.2" });
    const artifact = manifest.artifacts[0];
    const archive = join(output, artifact.filename);
    expect(sha256(archive)).toBe(artifact.sha256);
    writeFileSync(archive, Buffer.concat([readFileSync(archive), Buffer.from([0])]));
    expect(sha256(archive)).not.toBe(artifact.sha256);

    const rebuilt = runReleasePack(root);
    requireSuccess(rebuilt);
    const repairedManifest = readManifest(root);
    const repairedArtifact = repairedManifest.artifacts.find((entry) => entry.filename === artifact.filename)!;
    expect(sha256(join(output, repairedArtifact.filename))).toBe(repairedArtifact.sha256);
  }, 60_000);

  it("invalidates stale evidence and expected archives when tracked source is dirty", () => {
    const root = cloneRepo("dirty-source");
    const output = join(root, "release-artifacts");
    mkdirSync(output);
    writeFileSync(join(output, MANIFEST), "stale\n");
    for (const name of [
      "skill-harness-core-0.11.0.tgz",
      "skill-harness-adapters-0.11.0.tgz",
      "skill-harness-cli-0.11.0.tgz",
      "skill-harness-0.11.0.tgz",
    ]) writeFileSync(join(output, name), "stale\n");
    writeFileSync(join(root, "packages", "core", "README.md"), "dirty tracked source\n");

    const result = runReleasePack(root);
    expect(result.status).not.toBe(0);
    expect(result.combined).toMatch(/tracked source differs from recorded tree.*packages\/core\/README\.md/i);
    expect(readdirSync(output)).toEqual([]);
  }, 30_000);

  it("refuses raw workspace packing outside the authorized release command", () => {
    const root = cloneRepo("raw-pack-refused");
    const output = join(root, "raw-output");
    mkdirSync(output);
    for (const directory of ["core", "adapters", "cli", "skill-harness"]) {
      const manifest = JSON.parse(readFileSync(join(root, "packages", directory, "package.json"), "utf8"));
      expect(manifest.scripts.prepack).toBe("node ../../scripts/release-pack.mjs --guard");
    }
    const result = spawnSync("npm", ["pack", "-w", "@skill-harness/core", "--pack-destination", output], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).toMatch(/raw workspace pack\/publish is not authorized.*npm run release:pack/is);
    expect(readdirSync(output)).toEqual([]);
  }, 30_000);

  it("fails the reused-workspace regression when canonical output preparation is removed", () => {
    const clean = cloneRepo("mutation-clean-reference");
    const cleanResult = runReleasePack(clean);
    requireSuccess(cleanResult);
    const cleanCli = readFileSync(join(clean, CLI_OUTPUT));

    const mutated = cloneRepo("mutation-no-normalization");
    const cli = join(mutated, CLI_OUTPUT);
    mkdirSync(dirname(cli), { recursive: true });
    writeFileSync(cli, cleanCli);
    chmodSync(cli, 0o755);

    const script = join(mutated, "scripts", "release-pack.mjs");
    const source = readFileSync(script, "utf8");
    const needle = "await prepareCanonicalBuildOutputs(repoRoot);";
    expect(source.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    writeFileSync(script, source.replace(needle, 'await runNpm(repoRoot, ["run", "build"]); // mutation: normalization removed'));
    commitPaths(mutated, ["scripts/release-pack.mjs"]);

    const result = runReleasePack(mutated);
    expect(result.status).not.toBe(0);
    expect(result.combined).toMatch(/dist\/cli\.js.*0755.*0644|canonical mode.*0644/i);
    expect(existsSync(join(result.output, MANIFEST))).toBe(false);
  }, 90_000);
});
