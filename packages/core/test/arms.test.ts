import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { loadArms, resolveArm, NONE_ARM } from "../src/arms.js";

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
