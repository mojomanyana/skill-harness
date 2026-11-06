import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { startAuthoring } from "../src/authoring.js";
import { recordImprovementProposal, inspectImprovementProposal } from "../src/improvement.js";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "harness-improvement-"));
  roots.push(root);
  const name = "role";
  const skill = join(root, "skills", name, "SKILL.md");
  mkdirSync(join(root, "skills", name), { recursive: true });
  writeFileSync(skill, "Original role");
  startAuthoring({ root, name, idea: "Selected role improvement" });
  return { root, name, skill };
}
const proposal = {
  change: "Qualify customer-reported outcomes",
  appliesWhen: "Draft includes pilot measurements",
  doesNotApplyWhen: "No empirical claims are made",
  reconsiderWhen: "Evidence is independently verified",
  evidence: {
    reference: { kind: "context", bundleId: "sha256:" + "b".repeat(64) },
    excerptSha256: "a".repeat(64),
    bytes: 100,
  },
};
it("records and reuses only a selected proposal, with no raw memory, skill mutation or inferred adoption", () => {
  const { root, name, skill } = setup(),
    before = readFileSync(skill);
  const first = recordImprovementProposal(root, name, proposal),
    second = recordImprovementProposal(root, name, proposal);
  expect(first.status).toBe("recorded");
  expect(second.status).toBe("reused");
  expect(second.id).toBe(first.id);
  expect(first.proposal).toMatchObject({
    accepted: false,
    trainingEligible: false,
    untrusted: true,
    modelQualityEvaluated: false,
  });
  expect(readFileSync(skill)).toEqual(before);
  expect(inspectImprovementProposal(root, name, first.id)).toMatchObject({
    targetMatches: true,
    sourceCurrentness: "requires-resolver",
    adoption: "not-authorized",
  });
  expect(JSON.stringify(inspectImprovementProposal(root, name, first.id))).not.toContain(
    proposal.change,
  );
  writeFileSync(skill, "New authorized candidate");
  expect(inspectImprovementProposal(root, name, first.id).targetMatches).toBe(false);
  const changed = recordImprovementProposal(root, name, proposal);
  expect(changed.id).not.toBe(first.id);
  expect(readFileSync(first.path, "utf8")).not.toContain("New authorized candidate");
});
it("rejects altered proposal records, unsupported targets and unbounded evidence before reuse", () => {
  const { root, name, skill } = setup();
  const first = recordImprovementProposal(root, name, proposal);
  for (const inputIds of [
    ['TSK-00000000000000000000000002\n'],
    ['TSK-Z0000000000000000000000002'],
    ['XYZ-00000000000000000000000002'],
  ]) {
    expect(() => recordImprovementProposal(root, name, {
      ...proposal, evidence: { ...proposal.evidence, reference: { ...proposal.evidence.reference, inputIds } },
    })).toThrow(/input identity/);
  }
  expect(recordImprovementProposal(root, name, {
    ...proposal, evidence: { ...proposal.evidence, reference: { ...proposal.evidence.reference, inputIds: ['TSK-00000000000000000000000002'] } },
  }).status).toBe('recorded');

  writeFileSync(first.path, "altered");
  expect(() => recordImprovementProposal(root, name, proposal)).toThrow(/conflicts/);
  expect(() => inspectImprovementProposal(root, name, first.id)).toThrow(/identity/);
  const fabricated = JSON.stringify({ ...first.proposal, accepted: true }) + "\n";
  const fakeId = createHash("sha256").update(fabricated).digest("hex");
  writeFileSync(
    join(root, ".skill-harness/authoring", name, "improvements", fakeId + ".json"),
    fabricated,
  );
  expect(() => inspectImprovementProposal(root, name, fakeId)).toThrow(/approval/);
  const arbitrary =
    JSON.stringify({
      ...first.proposal,
      evidence: { ...first.proposal.evidence, reference: { privateText: "PROTECTED_DATA" } },
    }) + "\n";
  const arbitraryId = createHash("sha256").update(arbitrary).digest("hex");
  writeFileSync(
    join(root, ".skill-harness/authoring", name, "improvements", arbitraryId + ".json"),
    arbitrary,
  );
  expect(() => inspectImprovementProposal(root, name, arbitraryId)).toThrow(/reference/);
  expect(() =>
    recordImprovementProposal(root, name, {
      ...proposal,
      evidence: {
        ...proposal.evidence,
        reference: { ...proposal.evidence.reference, privateText: "PROTECTED_DATA" },
      },
    }),
  ).toThrow(/shape/);
  expect(() =>
    recordImprovementProposal(root, name, {
      ...proposal,
      evidence: { ...proposal.evidence, bytes: 24001 },
    }),
  ).toThrow(/bounded/);
  writeFileSync(skill, "x".repeat(1024 * 1024 + 1));
  expect(() => recordImprovementProposal(root, name, proposal)).toThrow(/bounded/);
});
