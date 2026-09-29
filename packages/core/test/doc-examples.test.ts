import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { loadSpec } from "../src/spec.js";

/**
 * Every `scenarios:` example in the docs, run through the real parser.
 *
 * Reader-facing examples must stay aligned with the real parser. In particular,
 * `unchanged_paths` requires a workspace; validating examples here prevents a
 * documentation edit from shipping an invalid first-run configuration.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DOC_DIRS = [join(REPO, "docs")];

const HEADER = `skill: demo
judge_persona: a strict reviewer
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: []
`;

/** Every fenced yaml block in a file, with the line it starts on. */
function yamlBlocks(text: string): { body: string; line: number }[] {
  const out: { body: string; line: number }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```ya?ml\s*$/.test(lines[i])) continue;
    const start = i + 1;
    const body: string[] = [];
    for (i = start; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    out.push({ body: body.join("\n"), line: start });
  }
  return out;
}

const cases = DOC_DIRS.filter(existsSync).flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((file) =>
      yamlBlocks(readFileSync(join(dir, file), "utf8"))
        // Only blocks that define scenarios — a `ship_bar:` fragment or a results
        // excerpt is not a spec and must not be pressed into one.
        .filter((b) => /^scenarios:/m.test(b.body))
        .map((b) => ({ label: `${join(dir, file).slice(REPO.length + 1)}:${b.line}`, body: b.body })),
    ),
);

describe("every documented scenario example parses", () => {
  it("found examples to check", () => {
    // A refactor that moves the docs must not silently turn this suite into a
    // no-op that reports green over nothing.
    expect(cases.length).toBeGreaterThanOrEqual(2);
  });

  it.each(cases)("$label", ({ body }) => {
    const dir = mkdtempSync(join(tmpdir(), "sh-docs-"));
    mkdirSync(join(dir, "tests"), { recursive: true });
    const specPath = join(dir, "tests", "specification.yaml");

    // A doc example is an excerpt: it shows the ONE field it is about and elides
    // the rest, which is the right way to write documentation. So the spec
    // preamble and the two structurally-required scenario fields are supplied
    // when absent — and nothing else is. Every field the example DOES write is
    // used exactly as written, which is where the errors live: the bug that
    // prompted this test was a real semantic conflict between two fields the
    // author had written, not missing boilerplate.
    const doc = (yaml.load(/^skill:/m.test(body) ? body : HEADER + body) ?? {}) as {
      scenarios?: Record<string, unknown>[];
    };
    for (const sc of doc.scenarios ?? []) {
      sc.turns ??= ["placeholder turn supplied by the doc-example test"];
      sc.checklist ??= ["placeholder checklist item supplied by the doc-example test"];
    }
    writeFileSync(specPath, yaml.dump(doc, { lineWidth: -1, noRefs: true }), "utf8");
    expect(() => loadSpec(specPath)).not.toThrow();
  });
});
