import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  requestSessionStorage,
  retainSelectedSessionData,
} from "./consent.mjs";
import { main } from "./main.mjs";
import { parseCases } from "./dataset.mjs";
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "decision-consent-"));
  dirs.push(dir);
  const doc = {
    schema: 1,
    cases: [
      {
        id: "a",
        input: "Explicit public selected input",
        question: "Is it present?",
        provenance: "synthetic",
        source: { sha256: "a".repeat(64), recordId: "a" },
        visibility: "public",
      },
    ],
  };
  const path = join(dir, "cases.json");
  await writeFile(path, JSON.stringify(doc));
  return { dir, path, cases: parseCases(doc) };
}
describe("selected-session data consent", () => {
  it("requires a fresh explicit choice and never inherits a previous interaction", async () => {
    const promptStorage = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null);
    const a = await requestSessionStorage({ sessionId: "s", promptStorage });
    const b = await requestSessionStorage({ sessionId: "s", promptStorage });
    expect(a.decision).toBe("granted");
    expect(b.decision).toBe("declined");
    expect(a.interactionId).not.toBe(b.interactionId);
    expect(promptStorage).toHaveBeenCalledTimes(2);
  });
  it("declining storage writes nothing, while granting retains only selected unlabeled inputs", async () => {
    const f = await fixture(),
      out = join(f.dir, "data.json");
    await retainSelectedSessionData({
      cases: f.cases,
      consent: await requestSessionStorage({ storage: "no" }),
      out,
    });
    await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
    await retainSelectedSessionData({
      cases: f.cases,
      consent: await requestSessionStorage({ storage: "yes" }),
      out,
    });
    const saved = JSON.parse(await readFile(out, "utf8"));
    expect(saved).toMatchObject({
      trainingReady: false,
      trainingEligible: false,
      providerOutputsIncluded: false,
      labelStatus: "unlabeled",
    });
    expect(saved.cases[0].input).toBe(f.cases[0].input);
    expect((await stat(out)).mode & 0o777).toBe(0o600);
  });
  it("rechecks current activation immediately before storage and leaves no learning file after invalidation", async () => {
    const f = await fixture(),
      out = join(f.dir, "run.jsonl"),
      providerCall = vi.fn();
    const consent = await requestSessionStorage({ storage: "yes" });
    let calls = 0;
    await expect(
      main(
        [
          "run",
          "--cases",
          f.path,
          "--provider",
          "jev",
          "--model",
          "typesafe/jev-1.13",
          "--out",
          out,
          "--allow-remote",
        ],
        {
          sessionConsent: consent,
          env: { OPENROUTER_API_KEY: "fake" },
          providerCall,
          beforeProviderCall: () => {
            if (++calls === 2) throw Error("consent invalidated");
          },
          emit: () => {},
        },
      ),
    ).rejects.toThrow("consent invalidated");
    expect(providerCall).not.toHaveBeenCalled();
    await expect(readFile(out + ".learning.json")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("a per-invocation decline still executes a fake JEV call without a learning copy", async () => {
    const f = await fixture(),
      out = join(f.dir, "run.jsonl"),
      providerCall = vi.fn().mockResolvedValue({
        status: "answered",
        probability: 1,
        resolvedModel: "typesafe/jev-1.13",
        error: null,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
        latencyMs: 0,
      });
    await main(
      [
        "run",
        "--cases",
        f.path,
        "--provider",
        "jev",
        "--model",
        "typesafe/jev-1.13",
        "--out",
        out,
        "--allow-remote",
        "--storage",
        "no",
      ],
      { providerCall, env: { OPENROUTER_API_KEY: "fake" }, emit: () => {} },
    );
    expect(providerCall).toHaveBeenCalledTimes(1);
    await expect(readFile(out + ".learning.json")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      JSON.parse(await readFile(out + ".consent.json", "utf8")).decision,
    ).toBe("declined");
  });
});
