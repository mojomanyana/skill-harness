import { describe, it, expect } from "vitest";
import {
  planAdjudication,
  collapseJudgments,
  projectAdjudication,
  formatAdjudicationPlan,
  runAdjudication,
  MAX_JUDGMENTS,
  type CellState,
} from "../src/adjudication.js";
import { score } from "../src/score.js";
import type { Judgment, ScenarioResult } from "../src/results.js";
import type { Scenario, ShipBar } from "../src/spec.js";
import type { Verdict } from "../src/score.js";

const BAR: ShipBar = { total: 4, min_pass: 3, no_critical_fail: true };

function scenario(id: string, critical = false): Scenario {
  return {
    id, title: id, critical, mode: "inline", turns: ["x"], checklist: ["y"],
    workspace: "none", remote: false,
  };
}

function cell(id: string, verdict: Verdict, over: Partial<CellState> = {}): CellState {
  return { id, verdict, reason: "", suspect: false, ...over };
}

function plan(cells: CellState[], opts: { tieBreak?: boolean; critical?: string[]; bar?: ShipBar } = {}) {
  return planAdjudication({
    cells,
    scenarios: cells.map((c) => scenario(c.id, (opts.critical ?? []).includes(c.id))),
    shipBar: opts.bar ?? BAR,
    critical: opts.critical ?? [],
    tieBreakAvailable: opts.tieBreak ?? false,
  });
}

const triggersFor = (p: ReturnType<typeof plan>, id: string) =>
  p.decisions.find((d) => d.id === id)!.triggers;

function judgment(ordinal: number, verdict: Verdict, over: Partial<Judgment> = {}): Judgment {
  return { ordinal, judge: { provider: "claude-code", model: "j" }, verdict, reason: "r", suspect: false, ...over };
}

// --------------------------------------------------------------- triggers

describe("trigger: ambiguous", () => {
  it("fires on JUDGE-AMBIGUOUS", () => {
    expect(triggersFor(plan([cell("A1", "JUDGE-AMBIGUOUS", { suspect: true })]), "A1")).toContain("ambiguous");
  });

  it("does not double-report as contradictory", () => {
    // An ambiguous verdict is also flagged suspect by the parser; reporting both
    // would make one root cause look like two.
    const t = triggersFor(plan([cell("A1", "JUDGE-AMBIGUOUS", { suspect: true })]), "A1");
    expect(t).not.toContain("contradictory");
  });
});

describe("trigger: contradictory", () => {
  it("fires on a misfire whose verdict is readable", () => {
    expect(triggersFor(plan([cell("A1", "FAIL", { suspect: true })]), "A1")).toContain("contradictory");
  });

  it("does not fire on a clean verdict", () => {
    expect(triggersFor(plan([cell("A1", "FAIL")]), "A1")).not.toContain("contradictory");
  });
});

describe("trigger: non_unanimous", () => {
  it("fires when reps split", () => {
    const t = triggersFor(plan([cell("A1", "PASS", { repVerdicts: ["PASS", "PASS", "FAIL"] })]), "A1");
    expect(t).toContain("non_unanimous");
  });

  it("does not fire on unanimous reps", () => {
    expect(triggersFor(plan([cell("A1", "PASS", { repVerdicts: ["PASS", "PASS", "PASS"] })]), "A1")).not.toContain("non_unanimous");
    expect(triggersFor(plan([cell("A1", "FAIL", { repVerdicts: ["FAIL", "FAIL"] })]), "A1")).not.toContain("non_unanimous");
  });

  it("does not fire on a single-rep cell", () => {
    expect(triggersFor(plan([cell("A1", "PASS", { repVerdicts: ["PASS"] })]), "A1")).not.toContain("non_unanimous");
    expect(triggersFor(plan([cell("A1", "PASS")]), "A1")).not.toContain("non_unanimous");
  });
});

describe("trigger: ship_deciding", () => {
  it("fires on the cell that is the difference between SHIP and NOT READY", () => {
    // 3 of 4 pass, min_pass 3 → shipping. Flipping the one PASS breaks it.
    const cells = [cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "FAIL")];
    const p = plan(cells);
    expect(triggersFor(p, "A1")).toContain("ship_deciding");
    // A4 is already failing; flipping it to PASS keeps the run shipping.
    expect(triggersFor(p, "A4")).not.toContain("ship_deciding");
  });

  it("fires in the rescue direction too", () => {
    // 2 of 4 pass, min_pass 3 → not shipping. Flipping either FAIL rescues it.
    const cells = [cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "FAIL"), cell("A4", "FAIL")];
    const p = plan(cells);
    expect(triggersFor(p, "A3")).toContain("ship_deciding");
  });

  it("respects the critical gate", () => {
    // All four pass the count bar, but C1 is critical and failing — so C1 alone
    // decides the ship, and the ordinary passes do not.
    const cells = [cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("C1", "FAIL")];
    const p = plan(cells, { critical: ["C1"], bar: { total: 4, min_pass: 3, no_critical_fail: true } });
    expect(triggersFor(p, "C1")).toContain("ship_deciding");
    expect(triggersFor(p, "A1")).not.toContain("ship_deciding");
  });

  it("respects the B-series gate", () => {
    const cells = [cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("B1", "FAIL")];
    const p = plan(cells, { bar: { total: 4, min_pass: 3, no_critical_fail: true } });
    // B-series failure blocks SHIP independently, so flipping B1 moves the answer.
    expect(triggersFor(p, "B1")).toContain("ship_deciding");
  });

  it("uses the real scorer, so the counterfactual matches the ship bar exactly", () => {
    const cells = [cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "FAIL")];
    const actual = score(cells.map((c) => ({ id: c.id, verdict: c.verdict })), { shipBar: BAR, critical: [] });
    expect(actual.ship).toBe(true);
    expect(triggersFor(plan(cells), "A1")).toContain("ship_deciding");
  });

  it("does not report a suspect cell as ship-deciding for the wrong reason", () => {
    // A suspect cell blocks SHIP by itself. If the counterfactual carried
    // `suspect` through, the run would stay blocked whatever we flipped and
    // EVERY suspect cell would look ship-deciding.
    const cells = [cell("A1", "PASS", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const t = triggersFor(plan(cells), "A1");
    expect(t).toContain("contradictory"); // the real reason it is re-judged
    expect(t).not.toContain("ship_deciding");
  });
});

describe("trigger selection", () => {
  it("reports every applicable trigger for a cell", () => {
    const cells = [
      cell("A1", "PASS", { suspect: true, repVerdicts: ["PASS", "FAIL"] }),
      cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "FAIL"),
    ];
    const t = triggersFor(plan(cells), "A1");
    expect(t).toContain("contradictory");
    expect(t).toContain("non_unanimous");
  });

  it("honours the enabled set", () => {
    const p = planAdjudication({
      cells: [cell("A1", "PASS", { repVerdicts: ["PASS", "FAIL"] })],
      scenarios: [scenario("A1")],
      shipBar: BAR, critical: [],
      enabled: ["ambiguous"],
      tieBreakAvailable: false,
    });
    expect(triggersFor(p, "A1")).toEqual([]);
  });
});

// --------------------------------------------------------------- call counts

describe("call counts — the spend ceiling", () => {
  it("is zero when nothing triggers", () => {
    const p = plan([cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")]);
    expect(p.triggered).toEqual([]);
    expect(p.maxAdditionalCalls).toBe(0);
  });

  it("is one call per triggered cell with no tie-break judge", () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "JUDGE-AMBIGUOUS", { suspect: true }), cell("A3", "PASS"), cell("A4", "PASS")];
    const p = plan(cells, { tieBreak: false });
    expect(p.triggered.sort()).toEqual(["A1", "A2"]);
    expect(p.maxAdditionalCalls).toBe(2);
  });

  it("is two calls per triggered cell when a tie-break judge exists", () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "JUDGE-AMBIGUOUS", { suspect: true }), cell("A3", "PASS"), cell("A4", "PASS")];
    expect(plan(cells, { tieBreak: true }).maxAdditionalCalls).toBe(4);
  });

  it("never exceeds the hard cap of three judgments per cell", () => {
    const cells = [cell("A1", "FAIL", { suspect: true })];
    const p = plan(cells, { tieBreak: true });
    // 1 first-wave + at most 2 additional.
    expect(p.maxAdditionalCalls / p.triggered.length + 1).toBeLessThanOrEqual(MAX_JUDGMENTS);
  });
});

// --------------------------------------------------------------- collapse

describe("collapseJudgments", () => {
  it("confirms when two clean judgments agree", () => {
    const r = collapseJudgments([judgment(1, "FAIL"), judgment(2, "FAIL")], "contradictory");
    expect(r.state).toBe("confirmed");
    expect(r.verdict).toBe("FAIL");
  });

  it("leaves two disagreeing judgments unresolved — no third, no answer", () => {
    const r = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL")], "non_unanimous");
    expect(r.state).toBe("unresolved");
    expect(r.verdict).toBeUndefined();
  });

  it("breaks a tie on a clean two-of-three majority", () => {
    const r = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL"), judgment(3, "FAIL")], "non_unanimous");
    expect(r.state).toBe("tie_broken");
    expect(r.verdict).toBe("FAIL");
  });

  it("excludes a misfired judgment from the vote", () => {
    // 1 PASS clean, 1 FAIL suspect → only one clean vote, nothing confirmed.
    const r = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL", { suspect: true })], "contradictory");
    expect(r.state).toBe("unresolved");
  });

  it("excludes an ambiguous judgment from the vote", () => {
    const r = collapseJudgments([judgment(1, "PASS"), judgment(2, "JUDGE-AMBIGUOUS")], "ambiguous");
    expect(r.state).toBe("unresolved");
  });

  it("lets a clean third break a tie even when a fourth-style malformed vote exists", () => {
    const r = collapseJudgments(
      [judgment(1, "PASS"), judgment(2, "FAIL"), judgment(3, "FAIL", { suspect: true })],
      "non_unanimous",
    );
    // Only 2 clean votes, and they disagree.
    expect(r.state).toBe("unresolved");
  });

  it("is unresolved with fewer than two clean votes", () => {
    expect(collapseJudgments([judgment(1, "PASS")], "ship_deciding").state).toBe("unresolved");
    expect(collapseJudgments([], "ship_deciding").state).toBe("unresolved");
  });

  it("keeps every judgment verbatim, however it collapsed", () => {
    const js = [judgment(1, "PASS"), judgment(2, "FAIL", { suspect: true })];
    expect(collapseJudgments(js, "contradictory").judgments).toEqual(js);
  });
});

// --------------------------------------------------------------- projection

const baseResult = (): ScenarioResult => ({
  id: "A1", judge_verdict: "PASS", judge_reason: "first wave", suspect: false, override: null, note: "",
});

describe("projectAdjudication", () => {
  it("unresolved sets suspect, which the existing ship bar already blocks on", () => {
    const adj = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL")], "non_unanimous");
    const r = projectAdjudication(baseResult(), adj);
    expect(r.suspect).toBe(true);

    const s = score([{ id: "A1", verdict: r.judge_verdict, suspect: r.suspect }], {
      shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [],
    });
    expect(s.ship).toBe(false);
  });

  it("unresolved preserves the first-wave verdict rather than overwriting it", () => {
    // `suspect` is what blocks; destroying the recorded verdict would remove what
    // the author needs to adjudicate.
    const adj = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL")], "non_unanimous");
    expect(projectAdjudication(baseResult(), adj).judge_verdict).toBe("PASS");
  });

  it("confirmed clears suspect and adopts the agreed verdict", () => {
    const adj = collapseJudgments([judgment(1, "FAIL"), judgment(2, "FAIL")], "contradictory");
    const r = projectAdjudication({ ...baseResult(), suspect: true }, adj);
    expect(r.judge_verdict).toBe("FAIL");
    expect(r.suspect).toBe(false);
  });

  it("tie_broken adopts the majority and clears suspect", () => {
    const adj = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL"), judgment(3, "FAIL")], "non_unanimous");
    const r = projectAdjudication(baseResult(), adj);
    expect(r.judge_verdict).toBe("FAIL");
    expect(r.suspect).toBe(false);
  });

  it("always attaches the full audit trail", () => {
    const adj = collapseJudgments([judgment(1, "PASS"), judgment(2, "FAIL")], "non_unanimous");
    expect(projectAdjudication(baseResult(), adj).adjudication!.judgments).toHaveLength(2);
  });

  it("leaves a result with no adjudication byte-identical", () => {
    // Absent must mean "historical single judge", never "judges agreed".
    const r = baseResult();
    expect("adjudication" in r).toBe(false);
    expect(r.suspect).toBe(false);
  });
});

// --------------------------------------------------------------- preflight

describe("formatAdjudicationPlan", () => {
  const secondary = { provider: "claude-code", model: "j2" };

  it("says nothing will be spent when nothing triggers", () => {
    const p = plan([cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")]);
    expect(formatAdjudicationPlan(p, { secondary })).toMatch(/no additional judge calls/);
  });

  it("states the exact maximum call count", () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const text = formatAdjudicationPlan(plan(cells, { tieBreak: true }), { secondary, tieBreak: { provider: "claude-code", model: "j3" } });
    expect(text).toMatch(/up to 2 additional judge call\(s\)/);
  });

  it("quotes counts, never dollars — a subscription judge reports no per-call usage", () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const text = formatAdjudicationPlan(plan(cells), { secondary });
    expect(text).not.toMatch(/\$/);
  });

  it("warns when no tie-break judge is configured", () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    expect(formatAdjudicationPlan(plan(cells), { secondary })).toMatch(/blocks SHIP/);
  });

  it("names each triggered cell and its reasons", () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    expect(formatAdjudicationPlan(plan(cells), { secondary })).toMatch(/A1: contradictory/);
  });
});

// --------------------------------------------------------------- execution

describe("runAdjudication — exact call counts", () => {
  const primary = { provider: "claude-code", model: "j1" };
  const secondary = { provider: "claude-code", model: "j2" };
  const tieBreak = { provider: "claude-code", model: "j3" };

  function spy(answers: Record<string, { verdict: Verdict; reason?: string; suspect?: boolean }[]>) {
    const calls: { id: string; judge: string }[] = [];
    const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
    const rejudge = async (id: string, judge: { provider: string; model: string }) => {
      calls.push({ id, judge: judge.model });
      const next = queues[id]?.shift() ?? { verdict: "PASS" as Verdict };
      return { verdict: next.verdict, reason: next.reason ?? "r", suspect: next.suspect ?? false };
    };
    return { calls, rejudge };
  }

  it("makes ZERO calls when nothing triggers", async () => {
    const cells = [cell("A1", "PASS"), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({});
    const r = await runAdjudication({
      plan: plan(cells), cells, primaryJudge: primary, secondaryJudge: secondary, rejudge: s.rejudge,
    });
    expect(s.calls).toEqual([]);
    expect(r.callsMade).toBe(0);
  });

  it("makes exactly one call when the secondary agrees with a CLEAN first wave", async () => {
    // non_unanimous: the first-wave verdict is clean, so it counts as a vote and
    // one agreeing secondary settles it.
    const cells = [
      cell("A1", "PASS", { repVerdicts: ["PASS", "FAIL"] }),
      cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS"),
    ];
    const s = spy({ A1: [{ verdict: "PASS" }] });
    const r = await runAdjudication({
      plan: plan(cells, { tieBreak: true }), cells,
      primaryJudge: primary, secondaryJudge: secondary, tieBreakJudge: tieBreak, rejudge: s.rejudge,
    });
    // No tie-break call: a third opinion on a settled cell is spend with no
    // decision attached to it.
    expect(s.calls).toEqual([{ id: "A1", judge: "j2" }]);
    expect(r.callsMade).toBe(1);
    expect(r.byId.get("A1")!.state).toBe("confirmed");
  });

  it("needs TWO fresh judgments when the first wave misfired", async () => {
    // A misfire is not evidence, so judgment 1 is never a clean vote. A
    // `contradictory` cell therefore cannot be confirmed by one agreeing
    // secondary — it takes two clean votes to agree on anything. Getting this
    // wrong would let a misfire confirm itself.
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({ A1: [{ verdict: "FAIL" }, { verdict: "FAIL" }] });
    const r = await runAdjudication({
      plan: plan(cells, { tieBreak: true }), cells,
      primaryJudge: primary, secondaryJudge: secondary, tieBreakJudge: tieBreak, rejudge: s.rejudge,
    });
    expect(s.calls.map((c) => c.judge)).toEqual(["j2", "j3"]);
    expect(r.callsMade).toBe(2);
    expect(r.byId.get("A1")!.state).toBe("confirmed");
    expect(r.byId.get("A1")!.verdict).toBe("FAIL");
  });

  it("a misfired first wave with no tie-break judge stays unresolved and blocks SHIP", async () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({ A1: [{ verdict: "FAIL" }] });
    const r = await runAdjudication({
      plan: plan(cells, { tieBreak: false }), cells,
      primaryJudge: primary, secondaryJudge: secondary, rejudge: s.rejudge,
    });
    expect(r.callsMade).toBe(1);
    expect(r.byId.get("A1")!.state).toBe("unresolved");
  });

  it("makes exactly two calls when the secondary disagrees and a tie-break exists", async () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({ A1: [{ verdict: "PASS" }, { verdict: "PASS" }] });
    const r = await runAdjudication({
      plan: plan(cells, { tieBreak: true }), cells,
      primaryJudge: primary, secondaryJudge: secondary, tieBreakJudge: tieBreak, rejudge: s.rejudge,
    });
    expect(s.calls.map((c) => c.judge)).toEqual(["j2", "j3"]);
    expect(r.callsMade).toBe(2);
  });

  it("stops at one call and stays unresolved with no tie-break judge", async () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({ A1: [{ verdict: "PASS" }] });
    const r = await runAdjudication({
      plan: plan(cells, { tieBreak: false }), cells,
      primaryJudge: primary, secondaryJudge: secondary, rejudge: s.rejudge,
    });
    expect(r.callsMade).toBe(1);
    expect(r.byId.get("A1")!.state).toBe("unresolved");
  });

  it("never exceeds the plan's stated ceiling", async () => {
    const cells = [
      cell("A1", "FAIL", { suspect: true }),
      cell("A2", "JUDGE-AMBIGUOUS", { suspect: true }),
      cell("A3", "PASS"), cell("A4", "PASS"),
    ];
    const p = plan(cells, { tieBreak: true });
    const s = spy({ A1: [{ verdict: "PASS" }, { verdict: "PASS" }], A2: [{ verdict: "PASS" }, { verdict: "PASS" }] });
    const r = await runAdjudication({
      plan: p, cells, primaryJudge: primary, secondaryJudge: secondary, tieBreakJudge: tieBreak, rejudge: s.rejudge,
    });
    expect(r.callsMade).toBeLessThanOrEqual(p.maxAdditionalCalls);
    expect(r.callsMade).toBe(4);
  });

  it("records the first-wave judge as judgment 1", async () => {
    const cells = [cell("A1", "FAIL", { suspect: true, reason: "first" }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({ A1: [{ verdict: "FAIL" }] });
    const r = await runAdjudication({
      plan: plan(cells), cells, primaryJudge: primary, secondaryJudge: secondary, rejudge: s.rejudge,
    });
    const js = r.byId.get("A1")!.judgments;
    expect(js[0]).toMatchObject({ ordinal: 1, judge: primary, reason: "first" });
    expect(js[1]).toMatchObject({ ordinal: 2, judge: secondary });
  });

  it("does not touch cells that did not trigger", async () => {
    const cells = [cell("A1", "FAIL", { suspect: true }), cell("A2", "PASS"), cell("A3", "PASS"), cell("A4", "PASS")];
    const s = spy({ A1: [{ verdict: "FAIL" }] });
    const r = await runAdjudication({
      plan: plan(cells), cells, primaryJudge: primary, secondaryJudge: secondary, rejudge: s.rejudge,
    });
    expect(r.byId.has("A2")).toBe(false);
    expect(s.calls.every((c) => c.id === "A1")).toBe(true);
  });
});
