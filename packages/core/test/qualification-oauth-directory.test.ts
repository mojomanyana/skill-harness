import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import {
  chmodSync,
  chownSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 } from "../src/qualification-config.js";
import { assertQualificationOAuthDirectoryContinuityV2, assertQualificationOAuthDirectoryPolicyV2 } from "../src/qualification-oauth-directory.js";

const roots: string[] = [];
const validationTime = "2026-09-01T12:00:00.000Z";

function oauthDirectory() {
  const root = mkdtempSync(join(tmpdir(), "qualification-oauth-v2-"));
  roots.push(root);
  const agent = join(root, "agent");
  mkdirSync(agent, { mode: 0o700 });
  chmodSync(agent, 0o700);
  const auth = join(agent, "auth.json");
  writeFileSync(auth, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-not-evidence" } }), { mode: 0o600 });
  chmodSync(auth, 0o600);
  return { root, agent, auth, env: { PI_CODING_AGENT_DIR: agent } };
}

function validate(env: NodeJS.ProcessEnv) {
  return assertQualificationOAuthDirectoryPolicyV2(env, {
    validation_point: "before-oauth-readiness",
    now: () => validationTime,
  });
}

function entry(result: ReturnType<typeof validate>, basename: string) {
  return result.inventory.entries.find((candidate) => candidate.basename === basename)!;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("qualification OAuth directory policy v2", () => {
  it("accepts only auth.json and records fixed present/absent occurrence tuples", () => {
    const files = oauthDirectory();
    const result = validate(files.env);
    expect(result.policy).toBe(QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2);
    expect(result.inventory).toMatchObject({
      schema_version: "qualification-oauth-directory-inventory-v2",
      policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
      validation_point: "before-oauth-readiness",
      validated_at: validationTime,
      valid: true,
      unexpected_entries: [],
      errors: [],
    });
    expect(result.inventory.entries.map((candidate) => [candidate.basename, candidate.present, candidate.file_type])).toEqual([
      ["auth.json", true, "regular"],
      ["models.json", false, "absent"],
      ["models-store.json", false, "absent"],
    ]);
    expect(entry(result, "auth.json")).toMatchObject({ mode: "0600", link_count: "1", validated_at: validationTime });
    expect(Object.keys(entry(result, "auth.json")).sort()).toEqual([
      "basename", "changed_at_ns", "device", "file_type", "gid", "inode", "link_count", "mode", "modified_at_ns", "present", "size_bytes", "uid", "validated_at",
    ]);
    expect(entry(result, "auth.json")).toMatchObject({
      uid: expect.any(Number), gid: expect.any(Number), device: expect.stringMatching(/^\d+$/), inode: expect.stringMatching(/^\d+$/),
      size_bytes: expect.stringMatching(/^\d+$/), modified_at_ns: expect.stringMatching(/^\d+$/), changed_at_ns: expect.stringMatching(/^\d+$/),
    });
    expect(JSON.stringify(result)).not.toContain("sentinel-not-evidence");
    const canonicalRoundTrip = JSON.parse(JSON.stringify(result.inventory));
    expect(() => assertQualificationOAuthDirectoryContinuityV2(result.inventory, canonicalRoundTrip, { allow_models_store_change: false })).not.toThrow();
  });

  it("accepts only an empty optional models.json and binds its occurrence", () => {
    const files = oauthDirectory();
    const models = join(files.agent, "models.json");
    writeFileSync(models, "{}", { mode: 0o600 });
    chmodSync(models, 0o600);
    expect(entry(validate(files.env), "models.json")).toMatchObject({ present: true, file_type: "regular", mode: "0600" });
    writeFileSync(models, JSON.stringify({ providers: { "openai-codex": { baseUrl: "https://proxy.invalid" } } }));
    chmodSync(models, 0o600);
    expect(() => validate(files.env)).toThrow(/models\.json.*empty object/i);
  });

  it("accepts a valid pre-existing models-store.json without retaining or hashing its contents", () => {
    const files = oauthDirectory();
    const store = join(files.agent, "models-store.json");
    writeFileSync(store, "sentinel-model-store-contents-must-not-be-read-or-hashed", { mode: 0o600 });
    chmodSync(store, 0o600);
    utimesSync(store, new Date(1_000), new Date(1_000));
    const atimeBefore = lstatSync(store, { bigint: true }).atimeNs;
    const result = validate(files.env);
    expect(entry(result, "models-store.json")).toMatchObject({ present: true, file_type: "regular", mode: "0600" });
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain("sentinel-model-store-contents");
    expect(Object.keys(entry(result, "models-store.json"))).not.toContain("sha256");
    expect(lstatSync(store, { bigint: true }).atimeNs).toBe(atimeBefore);
  });

  it.each([
    ["symlink", false],
    ["dangling symlink", true],
  ])("rejects a %s at an allowed basename", (_label, dangling) => {
    const files = oauthDirectory();
    const target = join(files.root, "target");
    if (!dangling) writeFileSync(target, "{}", { mode: 0o600 });
    symlinkSync(target, join(files.agent, "models-store.json"));
    expect(() => validate(files.env)).toThrow(/models-store\.json.*regular non-symlink/i);
  });

  it("rejects directories and FIFOs at an allowed basename", () => {
    const directoryCase = oauthDirectory();
    mkdirSync(join(directoryCase.agent, "models-store.json"), { mode: 0o700 });
    expect(() => validate(directoryCase.env)).toThrow(/models-store\.json.*regular non-symlink/i);

    if (process.platform !== "win32") {
      const fifoCase = oauthDirectory();
      try {
        execFileSync("mkfifo", [join(fifoCase.agent, "models-store.json")]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      expect(() => validate(fifoCase.env)).toThrow(/models-store\.json.*regular non-symlink/i);
    }
  });

  it("rejects a Unix socket at an allowed basename where supported", async () => {
    if (process.platform === "win32") return;
    const files = oauthDirectory();
    const socketPath = join(files.agent, "models-store.json");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    try {
      expect(() => validate(files.env)).toThrow(/models-store\.json.*regular non-symlink/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("requires exact mode 0600 and one hard link for every present allowed file", () => {
    for (const mode of [0o640, 0o400]) {
      const files = oauthDirectory();
      const store = join(files.agent, "models-store.json");
      writeFileSync(store, "{}", { mode });
      chmodSync(store, mode);
      expect(() => validate(files.env)).toThrow(/models-store\.json.*mode 0600/i);
    }

    if (process.platform !== "win32") {
      const files = oauthDirectory();
      const store = join(files.agent, "models-store.json");
      writeFileSync(store, "{}", { mode: 0o600 });
      linkSync(store, join(files.root, "second-link"));
      expect(() => validate(files.env)).toThrow(/models-store\.json.*one hard link/i);
    }
  });

  it("requires ownership by the effective qualification UID where testable", () => {
    if (process.platform === "win32" || process.geteuid?.() !== 0) return;
    const files = oauthDirectory();
    chownSync(files.auth, 65534, 65534);
    expect(() => validate(files.env)).toThrow(/auth\.json.*effective qualification UID/i);
  });

  it("rejects traversal aliases, alternate basenames, and missing auth.json", () => {
    const traversal = oauthDirectory();
    const traversedPath = `${traversal.root}/subdir/../agent`;
    mkdirSync(join(traversal.root, "subdir"));
    expect(() => validate({ PI_CODING_AGENT_DIR: traversedPath })).toThrow(/canonical absolute path.*traversal/i);

    const alternate = oauthDirectory();
    writeFileSync(join(alternate.agent, "AUTH.JSON"), "{}", { mode: 0o600 });
    expect(() => validate(alternate.env)).toThrow(/undeclared entr/i);

    const missing = oauthDirectory();
    rmSync(missing.auth);
    expect(() => validate(missing.env)).toThrow(/auth\.json.*required/i);
  });

  it("requires the exact real user-owned mode-0700 directory occurrence", () => {
    const files = oauthDirectory();
    chmodSync(files.agent, 0o750);
    expect(() => validate(files.env)).toThrow(/directory.*mode 0700/i);

    const alias = oauthDirectory();
    const symlink = join(alias.root, "agent-alias");
    symlinkSync(alias.agent, symlink);
    expect(() => validate({ PI_CODING_AGENT_DIR: symlink })).toThrow(/real non-symlink|alias/i);
  });
});
