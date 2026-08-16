import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  sourceHashes, currentHashFor, promptDocDigest, fileSha256,
  SKILL_KEY, SKILL_PROMPT_KEY, PROMPT_PREFIX, isSupersededKey,
  type SourceContext,
} from "../src/sources.js";
import { parseSpec } from "../src/spec.js";
import { lintSkill } from "../src/lint.js";
import { restampSkill } from "../src/restamp.js";
import { writeResults, readResults } from "../src/index.js";

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const SKILL_MD = `---
name: demo
description: >
  Use this when designing a system.
---

# Demo

## Core principle
Measure before you cut.
`;

const AGENT_MD = `---
name: plan
description: Delegate planning here.
tools: read, grep
---

# Plan

Slices first.
`;

const SPEC = `skill: demo
judge_persona: a demanding staff engineer.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
  - id: A2
    title: delegated
    turns: ["plan it"]
    checklist: ["plans"]
    system_prompt_file: agents/plan.md
`;

/** A skill dir with SKILL.md, a spec, and an agent file used as a system prompt. */
function skill(skillMd = SKILL_MD, agentMd = AGENT_MD): string {
  const d = mkdtempSync(join(tmpdir(), "sh-fm-"));
  tmps.push(d);
  writeFileSync(join(d, "SKILL.md"), skillMd, "utf8");
  mkdirSync(join(d, "tests", "agents"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"), SPEC, "utf8");
  writeFileSync(join(d, "tests", "agents", "plan.md"), agentMd, "utf8");
  return d;
}

function ctxFor(skillDir: string): SourceContext {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
  return {
    skillDir,
    specDir: join(skillDir, "tests"),
    scenarios: spec.scenarios,
    judgePersona: spec.judge_persona,
  };
}

/** Record a full run whose source hashes are whatever `hashes` says. */
function withRun(skillDir: string, hashes: Record<string, string>): string {
  const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeResults(runDir, {
    skill: "demo", harness: "pi", model: "fireworks:fake",
    judge: { provider: "anthropic", model: "opus" }, timestamp: "2026-07-01T00:00:00Z",
    label: null, mode: "force",
    scenarios: [
      { id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" },
      { id: "A2", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" },
    ] as any,
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
  const r = readResults(runDir);
  (r as any).source_hashes = hashes;
  writeFileSync(join(runDir, "results.yaml"), yaml.dump(r), "utf8");
  return runDir;
}

/** Only the staleness findings that name a source file (not fixtures/scenarios). */
function staleFindings(skillDir: string): string[] {
  return lintSkill(skillDir).filter((f) => f.code === "stale").map((f) => f.message);
}

// ---------------------------------------------------------------------------
// the digest itself
// ---------------------------------------------------------------------------

describe("promptDocDigest hashes what the model receives", () => {
  it("is unchanged when a capability declaration is added to frontmatter", () => {
    // The exact edit that started this: `allowed-tools` is consumed by the harness to
    // build a tool allowlist. No graded run can observe it, so it must not be able to
    // demand a paid re-run.
    const before = promptDocDigest(SKILL_MD);
    const after = promptDocDigest(SKILL_MD.replace("---\n\n# Demo", "allowed-tools: read, grep\n---\n\n# Demo"));
    expect(after).toBe(before);
  });

  it("changes when the body changes", () => {
    const edited = SKILL_MD.replace("Measure before you cut.", "Cut before you measure.");
    expect(promptDocDigest(edited)).not.toBe(promptDocDigest(SKILL_MD));
  });

  it("changes when `description` changes", () => {
    // Deliberate: under progressive disclosure the description IS what is in context and
    // decides whether the skill is selected at all. It is authored stimulus, not a
    // capability declaration, so it stays inside the gate.
    const edited = SKILL_MD.replace("Use this when designing a system.", "Use this when reviewing code.");
    expect(promptDocDigest(edited)).not.toBe(promptDocDigest(SKILL_MD));
  });

  it("changes when `name` changes", () => {
    // `name` is in context alongside the description under progressive disclosure.
    const edited = SKILL_MD.replace("name: demo", "name: architect");
    expect(promptDocDigest(edited)).not.toBe(promptDocDigest(SKILL_MD));
  });

  it("ignores reformatting that leaves every value identical", () => {
    // Built from the PARSED frontmatter, like the scenario digests are built from the
    // parsed scenario: refolding a `>` block the model receives identically is not a change.
    const refolded = SKILL_MD.replace(
      "description: >\n  Use this when designing a system.\n",
      "description: Use this when designing a system.\n",
    );
    expect(promptDocDigest(refolded)).toBe(promptDocDigest(SKILL_MD));
  });

  it("protects an unrecognised frontmatter key by default", () => {
    // A denylist, not an allowlist: a field nobody has classified stays INSIDE the gate,
    // so a new stimulus-bearing key fails loud instead of silently losing protection.
    const edited = SKILL_MD.replace("name: demo", "name: demo\nsome-future-key: matters");
    expect(promptDocDigest(edited)).not.toBe(promptDocDigest(SKILL_MD));
  });

  it("hashes frontmatter verbatim when it cannot be parsed", () => {
    const broken = "---\nname: [unterminated\n---\n\nbody\n";
    const alsoBroken = "---\nname: [unterminated too\n---\n\nbody\n";
    expect(promptDocDigest(broken)).not.toBe(promptDocDigest(alsoBroken));
  });

  it("hashes a document with no frontmatter at all", () => {
    expect(promptDocDigest("# Just a body\n")).not.toBe(promptDocDigest("# Another body\n"));
  });
});

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------

describe("recorded keys", () => {
  it("records the model-visible digest alongside the legacy whole-file hash", () => {
    const d = skill();
    const h = sourceHashes(ctxFor(d));
    expect(h[SKILL_KEY]).toBe(fileSha256(join(d, "SKILL.md")));
    expect(h[SKILL_PROMPT_KEY]).toBe(promptDocDigest(SKILL_MD));
    expect(h["agents/plan.md"]).toBe(fileSha256(join(d, "tests", "agents", "plan.md")));
    expect(h[PROMPT_PREFIX + "agents/plan.md"]).toBe(promptDocDigest(AGENT_MD));
  });

  it("resolves both new key kinds against the current sources", () => {
    const d = skill();
    const ctx = ctxFor(d);
    expect(currentHashFor(SKILL_PROMPT_KEY, ctx)).toBe(promptDocDigest(SKILL_MD));
    expect(currentHashFor(PROMPT_PREFIX + "agents/plan.md", ctx)).toBe(promptDocDigest(AGENT_MD));
  });

  it("reports a deleted prompt document as gone, not as not-comparable", () => {
    const d = skill();
    const ctx = ctxFor(d);
    rmSync(join(d, "tests", "agents", "plan.md"));
    expect(currentHashFor(PROMPT_PREFIX + "agents/plan.md", ctx)).toBeNull();
  });

  it("supersedes the legacy key only when the run recorded the model-visible one", () => {
    expect(isSupersededKey(SKILL_KEY, { [SKILL_KEY]: "x", [SKILL_PROMPT_KEY]: "y" })).toBe(true);
    expect(isSupersededKey(SKILL_KEY, { [SKILL_KEY]: "x" })).toBe(false);
    expect(isSupersededKey("agents/plan.md", { "agents/plan.md": "x", [PROMPT_PREFIX + "agents/plan.md"]: "y" })).toBe(true);
    expect(isSupersededKey("agents/plan.md", { "agents/plan.md": "x" })).toBe(false);
  });

  it("never supersedes a source the run failed to hash", () => {
    // The narrowing must not reopen the blind spot the whole module exists to close: a
    // source that was never verified stays reported, whichever digest is missing.
    expect(isSupersededKey(SKILL_KEY, { [SKILL_KEY]: "unreadable", [SKILL_PROMPT_KEY]: "y" })).toBe(false);
    expect(isSupersededKey(SKILL_KEY, { [SKILL_KEY]: "x", [SKILL_PROMPT_KEY]: "unreadable" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end to end through lint
// ---------------------------------------------------------------------------

describe("lint staleness against a run recorded by this version", () => {
  it("a frontmatter-only edit does NOT stale the run", () => {
    const d = skill();
    withRun(d, sourceHashes(ctxFor(d)));
    expect(staleFindings(d)).toEqual([]);

    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("---\n\n# Demo", "allowed-tools: read, grep\n---\n\n# Demo"), "utf8");
    writeFileSync(join(d, "tests", "agents", "plan.md"), AGENT_MD.replace("tools: read, grep", "tools: read, grep\nallowed-tools: read, grep"), "utf8");
    expect(staleFindings(d)).toEqual([]);
  });

  it("a body edit still DOES stale the run", () => {
    const d = skill();
    withRun(d, sourceHashes(ctxFor(d)));
    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("Measure before you cut.", "Cut first."), "utf8");
    expect(staleFindings(d).join("\n")).toMatch(/SKILL\.md/);
  });

  it("a description edit still DOES stale the run", () => {
    const d = skill();
    withRun(d, sourceHashes(ctxFor(d)));
    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("Use this when designing a system.", "Use this for code review."), "utf8");
    expect(staleFindings(d).join("\n")).toMatch(/SKILL\.md/);
  });

  it("an agent-file body edit still DOES stale the run", () => {
    const d = skill();
    withRun(d, sourceHashes(ctxFor(d)));
    writeFileSync(join(d, "tests", "agents", "plan.md"), AGENT_MD.replace("Slices first.", "Ship first."), "utf8");
    expect(staleFindings(d).join("\n")).toMatch(/agents\/plan\.md/);
  });
});

// ---------------------------------------------------------------------------
// the corpus recorded BEFORE this change
// ---------------------------------------------------------------------------

/** Exactly what a pre-upgrade run recorded: whole-file hashes under bare keys. */
function legacyHashes(skillDir: string): Record<string, string> {
  const h = sourceHashes(ctxFor(skillDir));
  for (const k of Object.keys(h)) {
    if (k === SKILL_PROMPT_KEY || k.startsWith(PROMPT_PREFIX)) delete h[k];
  }
  return h;
}

describe("a corpus recorded before this change", () => {
  it("stays green when nothing was edited", () => {
    // The acceptance test for the upgrade itself: changing how SKILL.md hashes must not
    // stale a board whose skills nobody touched. 62 real findings became 261 the last
    // time a digest element changed unconditionally.
    const d = skill();
    withRun(d, legacyHashes(d));
    expect(staleFindings(d)).toEqual([]);
  });

  it("is upgraded in place by restamp, and then survives a frontmatter-only edit", async () => {
    const d = skill();
    const runDir = withRun(d, legacyHashes(d));

    const report = await restampSkill(d);
    expect(report.upgraded).toBe(1);
    const h = readResults(runDir).source_hashes!;
    expect(h[SKILL_PROMPT_KEY]).toBe(promptDocDigest(SKILL_MD));
    expect(h[PROMPT_PREFIX + "agents/plan.md"]).toBe(promptDocDigest(AGENT_MD));

    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("---\n\n# Demo", "allowed-tools: read\n---\n\n# Demo"), "utf8");
    expect(staleFindings(d)).toEqual([]);
  });

  it("restamp refuses a record it cannot prove was fresh", async () => {
    // The stored hash is one-way: if the file already moved, nothing in the record can
    // say whether the body moved with it. Upgrading here would invent freshness.
    const d = skill();
    const runDir = withRun(d, legacyHashes(d));
    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("Measure before you cut.", "Cut first."), "utf8");

    const report = await restampSkill(d);
    expect(report.unprovable).toBe(1);
    // Per document, not per record: the agent file beside it never moved, so upgrading
    // THAT key is still a true statement about what this run measured.
    const h = readResults(runDir).source_hashes!;
    expect(h[SKILL_PROMPT_KEY]).toBeUndefined();
    expect(h[PROMPT_PREFIX + "agents/plan.md"]).toBe(promptDocDigest(AGENT_MD));
    expect(staleFindings(d).join("\n")).toMatch(/SKILL\.md/);
  });

  it("restamp is a no-op on an already-upgraded record", async () => {
    const d = skill();
    withRun(d, sourceHashes(ctxFor(d)));
    expect((await restampSkill(d)).upgraded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// upgrading a corpus whose frontmatter edit has ALREADY landed
// ---------------------------------------------------------------------------

/** Commit everything in `dir` to a fresh git repo. */
function commit(dir: string): void {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "corpus");
}

describe("restamp --from <ref>", () => {
  it("upgrades a record whose frontmatter was edited before anyone noticed", async () => {
    // The realistic case: you find out the gate over-fires only AFTER making the edit, so
    // there is no green worktree left to restamp. The pre-edit bytes are still in git, and
    // they carry the whole proof — the run measured them, and their model-visible text is
    // the same as today's.
    const d = skill();
    withRun(d, legacyHashes(d));
    commit(d);
    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("---\n\n# Demo", "allowed-tools: read\n---\n\n# Demo"), "utf8");
    expect(staleFindings(d).join("\n")).toMatch(/SKILL\.md/); // stale before the upgrade

    const report = await restampSkill(d, { from: "HEAD" });
    expect(report.upgraded).toBe(1);
    expect(staleFindings(d)).toEqual([]);
  });

  it("refuses when the body moved between the ref and now", async () => {
    const d = skill();
    withRun(d, legacyHashes(d));
    commit(d);
    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("Measure before you cut.", "Cut first."), "utf8");

    const report = await restampSkill(d, { from: "HEAD" });
    expect(report.unprovable).toBe(1);
    expect(staleFindings(d).join("\n")).toMatch(/SKILL\.md/);
  });

  it("a ref that does not resolve is an error, not a silent no-op", async () => {
    // Measured the hard way: `--from main` in a clone whose only branch was the feature
    // branch reported "0 upgraded, 140 left alone" and looked exactly like a corpus that
    // could not be proven. A migration that quietly does nothing is worse than one that
    // fails, because the operator concludes the upgrade is impossible.
    const d = skill();
    withRun(d, legacyHashes(d));
    commit(d);
    expect(() => restampSkill(d, { from: "no-such-ref" })).toThrow(/no-such-ref/);
  });

  it("refuses when the ref's bytes are not what the run measured", async () => {
    // The stored hash must match the REF, or the ref proves nothing about this run.
    const d = skill();
    withRun(d, { ...legacyHashes(d), [SKILL_KEY]: "0".repeat(64) });
    commit(d);
    writeFileSync(join(d, "SKILL.md"), SKILL_MD.replace("---\n\n# Demo", "allowed-tools: read\n---\n\n# Demo"), "utf8");

    const report = await restampSkill(d, { from: "HEAD" });
    expect(report.unprovable).toBe(1);
    expect(readResults(join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z")).source_hashes![SKILL_PROMPT_KEY]).toBeUndefined();
  });
});
