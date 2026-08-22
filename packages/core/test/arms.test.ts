import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { loadArms, resolveArm, NONE_ARM, seedArmDefinitions, type Arm } from "../src/arms.js";

/**
 * Builds a temp skills-root corpus: `tests/` and `ext/` dirs, with
 * `ext/grants.ts` present so fixtures can point a real `extensions` entry at
 * it. `armsYaml`, when given, is a function of the corpus root — so a fixture
 * that needs to embed an absolute path back into itself (like `VALID` below)
 * can build the real content in one pass, with no throwaway first write.
 * `null` omits `tests/arms.yaml` entirely.
 */
function corpus(armsYaml: ((root: string) => string) | null, extName = "grants.ts"): string {
  const root = mkdtempSync(join(tmpdir(), "sh-arms-"));
  mkdirSync(join(root, "tests"), { recursive: true });
  mkdirSync(join(root, "ext"), { recursive: true });
  writeFileSync(join(root, "ext", extName), "export default function () {}\n", "utf8");
  if (armsYaml !== null) writeFileSync(join(root, "tests", "arms.yaml"), armsYaml(root), "utf8");
  return root;
}

const VALID = (root: string) => `
arms:
  - name: pi-daddy
    extensions: [${root}/ext/grants.ts]
    seed_skills: [agents]
    require_definitions: 6
    env:
      PI_GRANTS_GRANT: "tool:read"
      PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl"
`;

describe("loadArms", () => {
  it("resolves extension paths to absolute", () => {
    const root = corpus(VALID);
    const arm = loadArms(root).get("pi-daddy")!;
    expect(isAbsolute(arm.extensions[0])).toBe(true);
    expect(arm.requireDefinitions).toBe(6);
    expect(arm.env.PI_GRANTS_GRANT).toBe("tool:read");
  });

  it("refuses an extension path that does not exist", () => {
    const root = corpus(() => "arms:\n  - name: a\n    extensions: [/nope/missing.ts]\n");
    expect(() => loadArms(root)).toThrow(/\/nope\/missing\.ts/);
  });

  it("refuses two arms with the same name", () => {
    // Written explicitly (not via string surgery on VALID) so the fixture is
    // legible on its own: two list entries, same name, no extensions — nothing
    // else about them can be the thing that throws.
    const root = corpus(
      () => `
arms:
  - name: pi-daddy
    extensions: []
  - name: pi-daddy
    extensions: []
`,
    );
    expect(() => loadArms(root)).toThrow(/pi-daddy/);
  });

  it("refuses the reserved name `none`", () => {
    const root = corpus(() => "arms:\n  - name: none\n    extensions: []\n");
    expect(() => loadArms(root)).toThrow(/reserved/);
  });

  it("is empty when the corpus declares no arms", () => {
    expect(loadArms(corpus(null)).size).toBe(0);
  });

  it("refuses an arm name that would not survive a directory name", () => {
    const root = corpus(() => "arms:\n  - name: 'bad/name'\n    extensions: []\n");
    expect(() => loadArms(root)).toThrow(/bad\/name/);
  });

  // Safety fix: a nested `env` value used to reach `String(v)` unchecked, which
  // stringifies an object as the literal text "[object Object]" — a corrupted
  // env var handed to the subject process with no indication anything went
  // wrong. Mutation: deleting the `typeof v === "object"` guard in arms.ts
  // makes this test's `toThrow` fail (loadArms would return normally with
  // `env.GRANT === "[object Object]"`).
  it("refuses a non-scalar env value instead of silently stringifying it (safety)", () => {
    const root = corpus(
      () => `
arms:
  - name: pi-daddy
    extensions: []
    env:
      GRANT: { nested: true }
`,
    );
    expect(() => loadArms(root)).toThrow(/env\.GRANT is not a scalar/);
  });
});

describe("resolveArm", () => {
  it("returns the none arm for a null name", () => {
    expect(resolveArm(corpus(null), null)).toEqual(NONE_ARM);
  });

  it("names the available arms when asked for an unknown one", () => {
    const root = corpus(VALID);
    expect(() => resolveArm(root, "typo")).toThrow(/pi-daddy/);
  });
});

describe("loadArms — path expansion", () => {
  it("expands a `~`-prefixed extension path against the home directory", () => {
    // Hermetic: never touches the real $HOME. The file name is unique per
    // process/run so it cannot coincidentally exist there; the assertion
    // proves `~` was expanded by checking the thrown message carries the
    // real, expanded absolute path rather than a literal tilde.
    const missing = `sh-arms-hometest-${process.pid}-${Date.now()}.ts`;
    const root = corpus(() => `arms:\n  - name: a\n    extensions: [~/${missing}]\n`);
    const expandedAbs = join(homedir(), missing);

    let thrown: Error | undefined;
    try {
      loadArms(root);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain(expandedAbs);
    expect(thrown!.message).not.toContain("~/");
  });

  it("resolves a relative extension path against the skills root, not the process cwd", () => {
    const root = corpus(() => "arms:\n  - name: a\n    extensions: [ext/grants.ts]\n");
    const arm = loadArms(root).get("a")!;
    expect(arm.extensions[0]).toBe(join(root, "ext", "grants.ts"));
  });
});

function armWith(over: Partial<Arm>): Arm {
  return { name: "pi-daddy", extensions: [], seedSkills: ["agents"], requireDefinitions: 2, env: {}, ...over };
}

function corpusWithAgents(count: number): string {
  const root = mkdtempSync(join(tmpdir(), "sh-seed-"));
  mkdirSync(join(root, "agents"), { recursive: true });
  for (let i = 0; i < count; i++) {
    writeFileSync(join(root, "agents", `a${i}.md`), `---\nname: a${i}\ntools: read\n---\n\nbody\n`, "utf8");
  }
  return root;
}

describe("seedArmDefinitions", () => {
  const emptyAmbient = () => mkdtempSync(join(tmpdir(), "sh-ambient-empty-"));

  it("copies definitions into <workspace>/.pi/skills and counts them", () => {
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const n = seedArmDefinitions(armWith({}), root, ws, { ambientSkillsDir: emptyAmbient() });
    expect(n).toBe(3);
    expect(readdirSync(join(ws, ".pi", "skills")).sort()).toEqual(["a0.md", "a1.md", "a2.md"]);
  });

  it("ERRORs when seeding produces fewer definitions than required", () => {
    const root = corpusWithAgents(1);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    expect(() => seedArmDefinitions(armWith({ requireDefinitions: 6 }), root, ws, { ambientSkillsDir: emptyAmbient() }))
      .toThrow(/1 .*6|seeded 1/);
  });

  it("ERRORs when the ambient skills root is non-empty", () => {
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-full-"));
    writeFileSync(join(ambient, "leaky.md"), "---\nname: leaky\n---\n", "utf8");
    expect(() => seedArmDefinitions(armWith({}), root, ws, { ambientSkillsDir: ambient })).toThrow(/leaky|ambient/i);
  });

  it("is a no-op for the control arm", () => {
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    expect(seedArmDefinitions(NONE_ARM, corpusWithAgents(3), ws, { ambientSkillsDir: emptyAmbient() })).toBe(0);
    expect(existsSync(join(ws, ".pi"))).toBe(false);
  });

  it("does not bypass the ambient-root check for a non-control arm with no seed_skills", () => {
    // pi-daddy reads the ambient root independently of seeding, so an arm
    // that loads it via `extensions` alone must not be able to dodge the
    // check just by declaring seed_skills: [].
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-full-"));
    writeFileSync(join(ambient, "leaky.md"), "---\nname: leaky\n---\n", "utf8");
    expect(() =>
      seedArmDefinitions(armWith({ seedSkills: [] }), corpusWithAgents(3), ws, { ambientSkillsDir: ambient }),
    ).toThrow(/leaky|ambient/i);
  });

  it("returns 0 without seeding when a non-control arm declares no seed_skills, requires none, and ambient is empty", () => {
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const n = seedArmDefinitions(armWith({ seedSkills: [], requireDefinitions: 0 }), corpusWithAgents(3), ws, {
      ambientSkillsDir: emptyAmbient(),
    });
    expect(n).toBe(0);
    expect(existsSync(join(ws, ".pi"))).toBe(false);
  });

  // I1: the vacuous-arm bypass this refusal exists to close. Before the fix, the
  // `seedSkills.length === 0` branch returned 0 immediately — before ever
  // consulting `requireDefinitions` — so an arm declaring `require_definitions: 6`
  // with an empty (or typo'd) `seed_skills` seeded nothing, returned 0, and ran
  // tagged `+pi-daddy` with nothing for pi-daddy to spawn. The check must fire
  // even though `seed_skills` is empty, not only when it names too few files.
  //
  // Mutation: reordering this back to `if (arm.seedSkills.length === 0) return 0;`
  // (checking require_definitions only after the seeding loop) makes this test's
  // `expect(...).toThrow(...)` fail — seedArmDefinitions would return 0 instead.
  it("ERRORs when require_definitions > 0 but seed_skills is empty, before ever seeding anything (I1)", () => {
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    expect(() =>
      seedArmDefinitions(armWith({ seedSkills: [], requireDefinitions: 6 }), corpusWithAgents(3), ws, {
        ambientSkillsDir: emptyAmbient(),
      }),
    ).toThrow(/require_definitions is 6/);
    expect(existsSync(join(ws, ".pi"))).toBe(false);
  });

  it("ERRORs when a seed_skills directory does not exist", () => {
    // Distinguishing check: the message must be the unreadable-directory
    // refusal specifically, not the fewer-than-required refusal — a version
    // of the code that silently treated the missing directory as 0 entries
    // would also throw (require_definitions: 1 > 0 seeded) but for the wrong
    // reason, so we assert on text unique to the unreadable-directory path.
    const root = mkdtempSync(join(tmpdir(), "sh-seed-missing-"));
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    let thrown: Error | undefined;
    try {
      seedArmDefinitions(armWith({ seedSkills: ["nonexistent"], requireDefinitions: 1 }), root, ws, {
        ambientSkillsDir: emptyAmbient(),
      });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain("cannot be read");
    expect(thrown!.message).toContain(join(root, "nonexistent"));
    expect(thrown!.message).not.toContain("require_definitions");
  });

  // Safety fix: `resolve(skillsRoot, "../..")` is accepted by `resolve()` without
  // complaint, and would have seeded the workspace from whatever sits outside the
  // corpus — an arm should only ever be able to name directories WITHIN the
  // corpus it belongs to. Mutation: deleting the `src.startsWith(resolvedRoot +
  // sep)` guard in arms.ts makes this test's `toThrow` fail — the escape would
  // be silently followed instead (and `corpusWithAgents`' md files, which sit
  // two levels up under the shared tmp root, would get seeded).
  it("refuses a seed_skills entry that escapes the skills root (safety)", () => {
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    expect(() =>
      seedArmDefinitions(armWith({ seedSkills: ["../.."] }), root, ws, { ambientSkillsDir: emptyAmbient() }),
    ).toThrow(/outside the skills root/);
    // `.pi/skills/` is created before the per-entry escape check runs, so it may
    // exist — what matters is that nothing from outside the root landed in it.
    expect(readdirSync(join(ws, ".pi", "skills"))).toEqual([]);
  });

  // Safety fix: a dangling symlink inside a seed directory used to throw
  // uncaught out of `statSync` — an unclassified crash instead of a message
  // naming the offending file. Mutation: reverting the try/catch around
  // `statSync(from)` back to a bare `statSync(from).isFile()` makes this test's
  // `toThrow` assertion on message content fail (it would still throw, but with
  // node's raw ENOENT message, not one naming the arm or the file as a likely
  // dangling symlink).
  it("fails with a message naming the file when a seed directory contains a dangling symlink (safety)", () => {
    const root = corpusWithAgents(1);
    symlinkSync(join(root, "agents", "does-not-exist.md"), join(root, "agents", "broken.md"));
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    let thrown: Error | undefined;
    try {
      seedArmDefinitions(armWith({ requireDefinitions: 1 }), root, ws, { ambientSkillsDir: emptyAmbient() });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain(join(root, "agents", "broken.md"));
    expect(thrown!.message).toContain("dangling symlink");
  });

  it("treats a missing ambient skills root as empty", () => {
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const missingAmbient = join(tmpdir(), `sh-ambient-missing-${process.pid}-${Date.now()}`);
    const n = seedArmDefinitions(armWith({}), root, ws, { ambientSkillsDir: missingAmbient });
    expect(n).toBe(3);
  });

  it("surfaces a non-ENOENT ambient-root read failure instead of treating it as empty", () => {
    // A file where a directory is expected reproduces a real, portable
    // non-ENOENT failure (ENOTDIR) without relying on permission tricks.
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const holder = mkdtempSync(join(tmpdir(), "sh-ambient-notdir-"));
    const notADir = join(holder, "not-a-directory");
    writeFileSync(notADir, "x", "utf8");

    let thrown: Error | undefined;
    try {
      seedArmDefinitions(armWith({}), root, ws, { ambientSkillsDir: notADir });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain("could not read");
    expect(thrown!.message).toContain(notADir);
    expect(thrown!.message).not.toContain("is not empty");
  });
});
