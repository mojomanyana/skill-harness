import { describe, test, expect } from "vitest";
import { score, letterFor } from "../src/score.js";
import type { ShipBar } from "../src/spec.js";

const SHIP_BAR: ShipBar = { total: 8, min_pass: 6, no_critical_fail: true };
const CRITICAL = ["A1", "A2", "B1", "C1", "C2"];

function verdicts(map: Record<string, "PASS" | "FAIL" | "ERROR">) {
  return Object.entries(map).map(([id, verdict]) => ({ id, verdict }));
}

describe("letterFor", () => {
  test("maps percentage to letter grade", () => {
    expect(letterFor(95)).toBe("A");
    expect(letterFor(90)).toBe("A");
    expect(letterFor(85)).toBe("B");
    expect(letterFor(75)).toBe("C");
    expect(letterFor(65)).toBe("D");
    expect(letterFor(59)).toBe("F");
    expect(letterFor(0)).toBe("F");
  });
});

describe("score", () => {
  test("counts passes and computes pct + letter", () => {
    const r = score(
      verdicts({ A1: "PASS", A2: "PASS", A3: "PASS", A4: "PASS", A5: "PASS", B1: "PASS", C1: "PASS", C2: "FAIL" }),
      { shipBar: SHIP_BAR, critical: CRITICAL }
    );
    expect(r.passed).toBe(7);
    expect(r.total).toBe(8);
    expect(r.pct).toBe(88);
    expect(r.letter).toBe("B");
  });

  test("SHIP when total/min_pass met and no critical or B-series fails", () => {
    const r = score(
      verdicts({ A1: "PASS", A2: "PASS", A3: "FAIL", A4: "FAIL", A5: "PASS", B1: "PASS", C1: "PASS", C2: "PASS" }),
      { shipBar: SHIP_BAR, critical: CRITICAL }
    );
    expect(r.passed).toBe(6);
    expect(r.ship).toBe(true);
    expect(r.criticalFails).toBe(0);
  });

  test("blocked when a critical scenario fails, with gated note", () => {
    const r = score(
      verdicts({ A1: "FAIL", A2: "PASS", A3: "PASS", A4: "PASS", A5: "PASS", B1: "PASS", C1: "PASS", C2: "PASS" }),
      { shipBar: SHIP_BAR, critical: CRITICAL }
    );
    expect(r.passed).toBe(7); // enough passes
    expect(r.criticalFails).toBe(1);
    expect(r.ship).toBe(false);
    expect(r.note).toMatch(/gated: 1 critical fail/);
  });

  test("blocked when a B-series scenario fails even if not in critical list", () => {
    const bar: ShipBar = { total: 8, min_pass: 6, no_critical_fail: true };
    const r = score(
      verdicts({ A1: "PASS", A2: "PASS", A3: "PASS", A4: "PASS", A5: "PASS", B2: "FAIL", C1: "PASS", C2: "PASS" }),
      { shipBar: bar, critical: ["A1"] } // B2 not critical, but B-series
    );
    expect(r.bSeriesFails).toBe(1);
    expect(r.ship).toBe(false);
  });

  test("blocked when fewer than min_pass pass", () => {
    const r = score(
      verdicts({ A1: "PASS", A2: "PASS", A3: "FAIL", A4: "FAIL", A5: "FAIL", B1: "PASS", C1: "PASS", C2: "PASS" }),
      { shipBar: SHIP_BAR, critical: CRITICAL }
    );
    expect(r.passed).toBe(5);
    expect(r.ship).toBe(false);
  });

  test("ERROR verdict counts as a fail", () => {
    const r = score(
      verdicts({ A1: "ERROR", A2: "PASS", A3: "PASS", A4: "PASS", A5: "PASS", B1: "PASS", C1: "PASS", C2: "PASS" }),
      { shipBar: SHIP_BAR, critical: CRITICAL }
    );
    expect(r.passed).toBe(7);
    expect(r.criticalFails).toBe(1); // A1 is critical and errored
    expect(r.ship).toBe(false);
  });
});
