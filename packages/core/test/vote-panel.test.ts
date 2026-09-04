import { describe, expect, it } from "vitest";
import { collapseVotePanel, runVotePanel, type PanelVote } from "../src/vote-panel.js";

const vote = (ordinal: number, verdict: "PASS" | "FAIL" | "ERROR", suspect = false): PanelVote => ({ ordinal, verdict, suspect });

describe("shared vote-panel machinery", () => {
  it("confirms two matching clean votes", () => {
    expect(collapseVotePanel([vote(1, "PASS"), vote(2, "PASS")])).toMatchObject({ state: "confirmed", verdict: "PASS", clean_votes: 2, split: false });
  });

  it("records a clean split and resolves it only with a majority", () => {
    expect(collapseVotePanel([vote(1, "PASS"), vote(2, "FAIL")])).toMatchObject({ state: "unresolved", split: true });
    expect(collapseVotePanel([vote(1, "PASS"), vote(2, "FAIL"), vote(3, "FAIL")])).toMatchObject({ state: "tie_broken", verdict: "FAIL", minority_rate: 1 / 3 });
  });

  it("does not count an error or suspect answer as a vote", () => {
    expect(collapseVotePanel([vote(1, "PASS"), vote(2, "ERROR"), vote(3, "FAIL", true)])).toMatchObject({ state: "unresolved", clean_votes: 1, split: false });
  });

  it("calls two initial judges and a third only for a clean split", async () => {
    const calls: number[] = [];
    const result = await runVotePanel({
      cast: async (ordinal) => { calls.push(ordinal); return ordinal === 1 ? vote(ordinal, "PASS") : vote(ordinal, "FAIL"); },
    });
    expect(calls).toEqual([1, 2, 3]);
    expect(result.calls_made).toBe(3);

    calls.length = 0;
    await runVotePanel({ cast: async (ordinal) => { calls.push(ordinal); return ordinal === 2 ? vote(ordinal, "ERROR") : vote(ordinal, "PASS"); } });
    expect(calls).toEqual([1, 2]);
  });
});
