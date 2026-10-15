import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  answerAuthoring, applyAuthoring, inspectAuthoring, readAuthoring, stageAuthoringDraft, startAuthoring,
  type AuthoringAnswers, type AuthoringDraft,
} from "../src/authoring.js";
import { discover } from "../src/discover.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function workspace() { const root = mkdtempSync(join(tmpdir(), "harness-authoring-")); roots.push(root); return root; }
const name = "social-manager";
const idea = "Help a small business plan social posts and prepare content for approval.";
const answers: AuthoringAnswers = {
  purpose: "Prepare a small business social content plan.",
  outcomes: "Audience-appropriate drafts with traceable claims and a useful calendar.",
  boundaries: "Do not publish, contact users, or read credentials. Ask before external actions.",
  tools: ["read"], placement: "same-repo", delivery: "skill",
};
const skill = `---\nname: ${name}\ndescription: Prepare social media content for human approval.\n---\n# Social content\nAsk about the audience. Draft posts; do not publish without approval.\n`;
function draft(): AuthoringDraft {
  return {
    files: [
      { area: "skill", path: "SKILL.md", content: skill },
      { area: "evals", path: "specification.yaml", content: JSON.stringify({
        skill: name, judge_persona: "Judge the requested observable behavior without requiring particular prose.",
        ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
        scenarios: [{ id: "A1", title: "Draft with approval boundary", env: { tools: ["read"] }, turns: ["Draft a post for a cafe's reopening."], checklist: ["Supplies a draft without claiming publication."] }],
      }) },
    ],
    requirements: [{ id: "RM-1", description: "Prepare content without taking external action.", scenarios: ["A1"] }],
    labelStatus: "proposed",
  };
}
function begin(root: string, overrides: Partial<AuthoringAnswers> = {}) {
  return startAuthoring({ root, name, idea, answers: { ...answers, ...overrides } });
}

it("starts from an idea, resumes with one missing question and accepts already-known answers without a model", () => {
  const root = workspace();
  startAuthoring({ root, name, idea, answers: { purpose: answers.purpose } });
  expect(inspectAuthoring(root, name).nextQuestion?.key).toBe("outcomes");
  expect(startAuthoring({ root, name, idea }).revision).toBe(1);
  expect(() => startAuthoring({ root, name, idea: "A different job" })).toThrow("different authoring brief");
  answerAuthoring(root, name, { ...answers, placement: "separate-repo" });
  expect(inspectAuthoring(root, name).nextQuestion?.key).toBe("evalRoot");
  answerAuthoring(root, name, { evalRoot: "evals" });
  expect(inspectAuthoring(root, name).nextQuestion).toBeNull();
  expect(() => answerAuthoring(root, name, { tools: "bash" } as unknown as Partial<AuthoringAnswers>)).toThrow("list");
});

it("previews and applies a portable skill plus same-repo evals, without installing, calling models or certifying proposed labels", () => {
  const root = workspace();
  begin(root);
  const preview = stageAuthoringDraft(root, name, draft());
  expect(preview.issues).toEqual([]);
  expect(preview.readyToApply).toBe(true);
  expect(preview.changes.every(c => c.before === null && c.kind === "create")).toBe(true);
  expect(readFileSync(join(root, ".skill-harness", "authoring", ".gitignore"), "utf8")).toBe("*\n");
  expect(() => readFileSync(join(root, "skills", name, "SKILL.md"))).toThrow();
  expect(() => applyAuthoring(root, name, { digest: "wrong" })).toThrow("preview digest");
  const result = applyAuthoring(root, name, { digest: preview.draftDigest! });
  expect(result.status).toBe("applied");
  expect(readFileSync(join(root, "skills", name, "SKILL.md"), "utf8")).toBe(skill);
  const found = discover(join(root, "skills"));
  expect(found).toHaveLength(1);
  expect(found[0].specSource).toBe("skills");
  const linkage = JSON.parse(readFileSync(join(root, "skills", name, "tests", "authoring.json"), "utf8"));
  expect(linkage).toMatchObject({ skillsRoot: ".", labelStatus: "proposed", calibrated: false, modelQualityEvaluated: false, agent: null });
  expect(applyAuthoring(root, name, { digest: preview.draftDigest! }).status).toBe("already-applied");
});

it("keeps separate evals discoverable and a pi-daddy wrapper outside the portable skill", () => {
  const root = workspace();
  begin(root, { placement: "separate-repo", evalRoot: "evaluation-repo", delivery: "skill-and-agent", agentCapabilities: ["context:files"] });
  const data = draft();
  data.files.push({ area: "agent", path: "social-manager-agent.md", content: `---\nname: social-manager-agent\ndescription: Prepare content drafts.\ntools: read\nallowed-tools: read, context:files\n---\nRead the installed social-manager skill. Return drafts to the parent; do not publish.\n` });
  const preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues).toEqual([]);
  applyAuthoring(root, name, { digest: preview.draftDigest! });
  expect(discover(join(root, "skills"), join(root, "evaluation-repo"))[0].specSource).toBe("specs");
  expect(readFileSync(join(root, "agents", "social-manager-agent.md"), "utf8")).toContain("allowed-tools: read");
  expect(readFileSync(join(root, "skills", name, "SKILL.md"), "utf8")).not.toContain("pi-daddy");
  const linkage = JSON.parse(readFileSync(join(root, "evaluation-repo", name, "tests", "authoring.json"), "utf8"));
  expect(linkage).toMatchObject({ skillsRoot: "../skills", agent: { installed: false, grantsChanged: false } });
});

it("requires a distinct spawnable wrapper identity and a declared ceiling no wider than the brief", () => {
  const root = workspace();
  begin(root, { delivery: "skill-and-agent" });
  const data = draft();
  const wrapper = { area: "agent" as const, path: "social-manager-agent.md", content: "" };
  data.files.push(wrapper);
  const content = (header: string, agentName = "social-manager-agent") => `---\nname: ${agentName}\ndescription: Draft copy\n${header}\n---\nReturn a draft to the parent.\n`;
  for (const [header, reason] of [
    ["tools: read", "requires explicit allowed-tools"],
    ["allowed-tools: read, bash", "outside the agreed brief"],
    ["allowed-tools: read, context:files", "outside the agreed brief"],
    ["allowed-tools: \"read\"", "without YAML quotes"],
    ["allowed-tools: Bash(git:*)", "without quotes, patterns or wildcards"],
  ]) {
    wrapper.content = content(header);
    expect(stageAuthoringDraft(root, name, data).issues.join(" "), header).toContain(reason);
  }
  wrapper.content = content("allowed-tools: read", name);
  expect(stageAuthoringDraft(root, name, data).issues.join(" ")).toContain("name must match");
  wrapper.path = `${name}.md`;
  expect(stageAuthoringDraft(root, name, data).issues.join(" ")).toContain("must differ");
  wrapper.path = `${name}-agent.md`;
  wrapper.content = content("allowed-tools:");
  expect(stageAuthoringDraft(root, name, data).issues).toEqual([]);
});

it("preserves imported skill bytes, captures them in the preview and stops on later destination drift", () => {
  const root = workspace();
  const skillDir = join(root, "existing", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skill);
  const state = startAuthoring({ root, name, idea, skillDir, answers });
  expect(state.imported?.sha256).toMatch(/^[a-f0-9]{64}$/);
  const data = draft();
  data.files = data.files.filter(f => f.area !== "skill");
  const preview = stageAuthoringDraft(root, name, data);
  expect(preview.changes.find(c => c.path === "SKILL.md")?.kind).toBe("unchanged");
  writeFileSync(join(skillDir, "SKILL.md"), skill + "An unrelated edit.\n");
  expect(inspectAuthoring(root, name).issues.join(" ")).toContain("changed since preview");
  expect(() => applyAuthoring(root, name, { digest: preview.draftDigest! })).toThrow("changed since preview");
  expect(() => readFileSync(join(skillDir, "tests", "specification.yaml"))).toThrow();
  expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toContain("unrelated edit");
});

it("binds updates and generated linkage to the reviewed preview and retains previous file bytes", () => {
  const root = workspace();
  begin(root);
  const original = stageAuthoringDraft(root, name, draft());
  applyAuthoring(root, name, { digest: original.draftDigest! });
  const data = draft();
  data.files[0].content += "Check attribution before final delivery.\n";
  const next = stageAuthoringDraft(root, name, data);
  expect(next.changes.find(c => c.path === "SKILL.md")).toMatchObject({ kind: "update", before: skill });
  const manifest = next.changes.find(c => c.path === "authoring.json")!;
  writeFileSync(manifest.destination, "unrelated local edit");
  expect(() => applyAuthoring(root, name, { digest: next.draftDigest! })).toThrow("changed since preview");
  writeFileSync(manifest.destination, manifest.before!);
  applyAuthoring(root, name, { digest: next.draftDigest! });
  expect(readFileSync(join(root, ".skill-harness", "authoring", name, "backups", next.draftDigest!, "0.txt"), "utf8")).toBe(skill);
  answerAuthoring(root, name, { boundaries: "A newly approved boundary." });
  expect(readAuthoring(root, name).draft).toBeUndefined();
});

it("rejects traceability gaps and missing fixtures before any product write", () => {
  const root = workspace();
  begin(root);
  const data = draft();
  data.requirements[0].scenarios = ["missing"];
  const preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues).toEqual(expect.arrayContaining(["Requirement RM-1 names unknown scenario missing", "Scenario A1 has no requirement"]));
  data.requirements[0].scenarios = ["A1"];
  const spec = JSON.parse(data.files[1].content);
  spec.scenarios[0].mode = "seeded";
  spec.scenarios[0].fixture = "fixtures/cafe";
  data.files[1].content = JSON.stringify(spec);
  expect(stageAuthoringDraft(root, name, data).issues.join(" ")).toContain("fixture is missing");
  data.files.push({ area: "evals", path: "fixtures/cafe/brief.txt", content: "Cafe reopens Monday." });
  expect(stageAuthoringDraft(root, name, data).issues).toEqual([]);
});

it("checks declared tool access and selected judge references while leaving authoring proxies as review hints", () => {
  const root = workspace();
  begin(root);
  const data = draft();
  const spec = JSON.parse(data.files[1].content);
  spec.scenarios[0].judge_references = ["references/cafe.txt"];
  spec.scenarios[0].env = { tools: ["read"], workspace: "fixture:fixtures/cafe" };
  spec.scenarios[0].assert = { trace: { require_calls: [{ tool: "read", args: { path: { matches: "(^|/)brief\\.txt$" } } }] } };
  data.files[1].content = JSON.stringify(spec);
  data.files.push({ area: "evals", path: "fixtures/cafe/brief.txt", content: "Cafe opens Monday." });
  let preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues.join(" ")).toContain("support file is missing: references/cafe.txt");
  data.files.push({ area: "evals", path: "references/cafe.txt", content: "Cafe opens Monday." });
  preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues).toEqual([]);
  expect(preview.warnings.join(" ")).toContain("not named in the prompt");
  expect(preview.readyToApply).toBe(true);
  spec.scenarios[0].env.tools = [];
  data.files[1].content = JSON.stringify(spec);
  preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues.join(" ")).toContain("Required tool read is excluded");
  expect(preview.readyToApply).toBe(false);
});

it("binds generated eval tool profiles and ship arithmetic to the agreed brief before materializing", () => {
  const root = workspace();
  begin(root);
  const data = draft();
  const spec = JSON.parse(data.files[1].content);
  delete spec.scenarios[0].env.tools;
  spec.ship_bar = { total: 99, min_pass: 99 };
  data.files[1].content = JSON.stringify(spec);
  let preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues).toEqual(expect.arrayContaining([expect.stringContaining("explicit env.tools"), "Ship bar total must equal the 1 authored scenarios", "Ship bar min_pass must be an integer between 1 and the scenario count"]));
  spec.scenarios[0].env.tools = ["bash"];
  spec.ship_bar = { total: 1, min_pass: 1 };
  data.files[1].content = JSON.stringify(spec);
  expect(stageAuthoringDraft(root, name, data).issues.join(" ")).toContain("outside the agreed tool profile");
  spec.scenarios[0].env.tools = [];
  data.files[1].content = JSON.stringify(spec);
  preview = stageAuthoringDraft(root, name, data);
  expect(preview.issues).toEqual([]);
  expect(preview.readyToApply).toBe(true);
  spec.ship_bar.min_pass = 0.5;
  data.files[1].content = JSON.stringify(spec);
  expect(stageAuthoringDraft(root, name, data).issues.join(" ")).toContain("min_pass must be an integer");
});

it("refuses path traversal, symlinks, duplicate destinations, reserved evidence paths and wrapper surprises", () => {
  const root = workspace();
  const outside = workspace();
  begin(root);
  for (const path of ["../escape", "folder/../../escape", "/escape", "C:/escape", "folder\\escape", "NUL.txt", "folder./a", ".git/config"]) {
    const data = draft();
    data.files.push({ area: "skill", path, content: "no" });
    expect(() => stageAuthoringDraft(root, name, data), path).toThrow(/path/i);
  }
  const duplicate = draft();
  duplicate.files.push({ ...duplicate.files[0], path: "skill.md" });
  expect(() => stageAuthoringDraft(root, name, duplicate)).toThrow("Duplicate");
  const results = draft();
  results.files.push({ area: "evals", path: "results/historical.yaml", content: "no" });
  expect(() => stageAuthoringDraft(root, name, results)).toThrow("Reserved");
  const agent = draft();
  agent.files.push({ area: "agent", path: "agent.md", content: "no" });
  expect(() => stageAuthoringDraft(root, name, agent)).toThrow("not selected");
  mkdirSync(join(root, "skills", name), { recursive: true });
  symlinkSync(outside, join(root, "skills", name, "redirect"), "junction");
  const linked = draft();
  linked.files.push({ area: "skill", path: "redirect/escape.txt", content: "no" });
  expect(() => stageAuthoringDraft(root, name, linked)).toThrow("Symlink");
  expect(() => readFileSync(join(outside, "escape.txt"))).toThrow();
});
