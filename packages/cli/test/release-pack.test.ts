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

interface ReleaseManifest {
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
  return destination;
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
    expect(aliasResult.combined).toMatch(/output directory .* overlaps managed repository paths/i);
    expect(existsSync(join(overlapOutput, MANIFEST))).toBe(false);
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

    const result = runReleasePack(mutated);
    expect(result.status).not.toBe(0);
    expect(result.combined).toMatch(/dist\/cli\.js.*0755.*0644|canonical mode.*0644/i);
    expect(existsSync(join(result.output, MANIFEST))).toBe(false);
  }, 90_000);
});
