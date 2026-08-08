import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  collectReport, renderReport, collectTrends,
  readResults, writeResults, applyOverride, preserveTranscript, findTranscriptFiles,
  ensureResultsGitignore,
  appendJournal,
  type Verdict, type ResultsFile,
  loadSpec,
  regradeScenario, refreshRubricHashes, findJudgeRawFiles,
  effectiveThreshold, scoreContextFor, isScoredMode, rebuildScenarioResult,
  envFlag,
  planAdjudication, adjudicateRun, assertJudgeAllowed, cellsFromResults,
} from "@skill-harness/core";
import { getAdapter } from "@skill-harness/adapters";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Locate assets/report.template.html relative to dist/ or src/. */
function templatePath(assetsDir?: string): string {
  if (assetsDir) return join(assetsDir, "report.template.html");
  const candidates = [
    join(__dirname, "..", "..", "..", "assets", "report.template.html"), // packages/cli/{dist,src} -> ../../../assets
    join(__dirname, "..", "assets", "report.template.html"),
    join(__dirname, "..", "..", "assets", "report.template.html"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("cannot find assets/report.template.html");
}

/** assets/report.grade.js — the client scorer injected into the template (sibling of the template). */
function gradeScriptPath(assetsDir?: string): string {
  return join(dirname(templatePath(assetsDir)), "report.grade.js");
}

export interface ServeOptions {
  skillDir: string;
  skillName: string;
  port?: number;
  open?: boolean;
  adapter?: import("@skill-harness/core").HarnessAdapter; // test seam: overrides getAdapter(results.harness) in /rejudge
  assetsDir?: string; // override the resolved assets dir (report.template.html + report.grade.js); defaults to templatePath()'s built-in resolution — needed so bundlers/embedders (e.g. the pi-extension) can point at a known-good assets location instead of relying on __dirname-relative lookup.
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

/** All of a scenario's transcripts, concatenated with a filename header per file for reps runs. */
function findTranscript(runDir: string, id: string): string | null {
  const files = findTranscriptFiles(runDir, id);
  if (files.length === 0) return null;
  if (files.length === 1) return readFileSync(join(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====\n${readFileSync(join(runDir, f), "utf8")}`).join("\n\n");
}

/** All of a scenario's judge-raw artifacts, concatenated with a header per rep. */
function findJudgeRaw(runDir: string, id: string): string | null {
  // Mode-agnostic (no mode arg): run.ts writes judge-raw for every mode
  // (red/force too), and /transcript's findTranscript is mode-agnostic —
  // the inspector must show a red/force run's judge output too.
  const files = findJudgeRawFiles(runDir, id);
  if (files.length === 0) return null;
  if (files.length === 1) return readFileSync(join(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====\n${readFileSync(join(runDir, f), "utf8")}`).join("\n\n");
}

export interface ServeHandle {
  port: number;
  close: () => void;
}

export async function serveReview(opts: ServeOptions): Promise<ServeHandle> {
  const template = readFileSync(templatePath(opts.assetsDir), "utf8");
  const gradeScript = readFileSync(gradeScriptPath(opts.assetsDir), "utf8");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/") {
        const data = collectReport(opts.skillDir);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderReport(template, data, gradeScript));
        return;
      }

      if (req.method === "GET" && url.pathname === "/transcript") {
        const col = Number(url.searchParams.get("col"));
        const id = url.searchParams.get("id") ?? "";
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === col);
        const text = column ? findTranscript(column.runDir, id) : null;
        res.writeHead(text ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
        res.end(text ?? "transcript not found");
        return;
      }

      if (req.method === "GET" && url.pathname === "/judge") {
        const col = Number(url.searchParams.get("col"));
        const id = url.searchParams.get("id") ?? "";
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === col);
        const text = column ? findJudgeRaw(column.runDir, id) : null;
        res.writeHead(text ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
        res.end(text ?? "judge output not captured");
        return;
      }

      if (req.method === "GET" && url.pathname === "/trends") {
        const data = collectTrends(opts.skillDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }

      if (req.method === "POST" && url.pathname === "/rejudge") {
        const body = JSON.parse((await readBody(req)) || "{}") as { col: number; scenarioId: string };
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) { res.writeHead(404).end("unknown column"); return; }
        const results = readResults(column.runDir);
        // Skill-delivered runs only (green or force). A red baseline's transcripts
        // can be re-judged too — `skill-harness grade <run-dir>` does it — but a
        // baseline has no grade for this endpoint to report back, and the button
        // sits under a scorecard.
        if (!isScoredMode(results.mode)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `only scored runs (green/force) can be re-judged here — for a ${results.mode} run use \`skill-harness grade\`` }));
          return;
        }
        const specPath = join(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const scenario = spec.scenarios.find((s) => s.id === body.scenarioId);
        if (!scenario) { res.writeHead(404).end("unknown scenario"); return; }
        const adapter = opts.adapter ?? getAdapter(results.harness);
        if (!(await adapter.available())) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `harness \`${results.harness}\` is not on PATH` }));
          return;
        }
        const prev = results.scenarios.find((s) => s.id === body.scenarioId);
        if (!prev) { res.writeHead(404).end("scenario not in this run"); return; }
        const threshold = effectiveThreshold(prev, scenario);
        try {
          const rr = await regradeScenario({
            runDir: column.runDir, spec, scenario, adapter, judge: results.judge,
            specDir: dirname(specPath), threshold, mode: results.mode,
          });
          const merged = results.scenarios.map((s) =>
            // Same contract as `grade`, through the same choke point.
            s.id === body.scenarioId
              ? rebuildScenarioResult(rr, s, { objective: "carry", adjudication: "drop" })
              : s
          );
          const written = writeResults(column.runDir, {
            skill: results.skill, harness: results.harness, model: results.model, judge: results.judge,
            timestamp: results.timestamp, label: results.label, mode: results.mode, scenarios: merged,
            partial: results.partial,
            // Provenance survives a UI re-judge, same as it does through `grade`.
            harness_cli_version: results.harness_cli_version, delivery_canary: results.delivery_canary,
            // Recorded hashes were being dropped here entirely, which silently
            // retired the staleness gate for any run re-judged from the UI. Carried,
            // with the one `rubric:` key this re-judge actually applied refreshed —
            // the same doctrine `grade` follows (see refreshRubricHashes).
            source_hashes: refreshRubricHashes(results.source_hashes, spec, [body.scenarioId]),
          }, scoreContextFor(results, spec));
          ensureResultsGitignore(join(opts.skillDir, "tests", "results"));
          const g = written.effective_grade;
          appendJournal(column.runDir, { event: "score", ts: new Date().toISOString(), passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, grade: g }));
        } catch (e) {
          // regradeScenario (or the write/journal that follows) failed — surface the
          // real reason as JSON so the client's r.json().catch(()=>({})) sees body.error
          // instead of falling through to the generic top-level 500 (text/plain).
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      /**
       * Adjudication, in two steps: `plan` returns the exact call ceiling and
       * spends nothing; `run` executes it.
       *
       * Two requests rather than one because the ceiling has to be disclosed
       * BEFORE anything is spent, and a single endpoint that both prices and
       * charges cannot do that — the UI would be showing a count for work that
       * had already happened.
       */
      if (req.method === "POST" && url.pathname === "/adjudicate") {
        const body = JSON.parse((await readBody(req)) || "{}") as { col: number; step?: "plan" | "run" };
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) { res.writeHead(404).end("unknown column"); return; }
        const results = readResults(column.runDir);
        if (!isScoredMode(results.mode)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `only scored runs (green/force) can be adjudicated — for a ${results.mode} run use \`skill-harness grade\`` }));
          return;
        }
        const specPath = join(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const adapter = opts.adapter ?? getAdapter(results.harness);

        // Priced exactly as `adjudicateRun` will perform it — including per-rep
        // verdicts, without which the quoted ceiling can be lower than the spend.
        const cells = cellsFromResults(column.runDir, results);
        // No tie-break judge from the browser: adding a third judge is a judge
        // CHOICE, and the UI has nowhere honest to make one. A disagreement here
        // stays unresolved and blocks SHIP, which is the safe direction.
        const plan = planAdjudication({
          cells, scenarios: spec.scenarios, shipBar: spec.ship_bar, critical: spec.critical,
          tieBreakAvailable: false,
        });

        if (body.step !== "run") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            ok: true, step: "plan",
            triggered: plan.triggered,
            maxAdditionalCalls: plan.maxAdditionalCalls,
            judge: `${results.judge.provider}:${results.judge.model}`,
            detail: plan.decisions.filter((d) => d.triggers.length).map((d) => `${d.id}: ${d.triggers.join(", ")}`),
          }));
          return;
        }

        if (!(await adapter.available())) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `harness \`${results.harness}\` is not on PATH` }));
          return;
        }
        try {
          assertJudgeAllowed(results.judge, { source: "the run's recorded judge", allowMetered: envFlag("SKILL_HARNESS_ALLOW_METERED_JUDGE") });
          const written = await adjudicateRun({
            runDir: column.runDir, spec, adapter, results,
            primaryJudge: results.judge,
            // Asked again as an independent draw. The judge-variance study measured
            // ~2% self-disagreement on identical transcripts, so this is a real
            // second opinion rather than a no-op.
            secondaryJudge: results.judge,
            specDir: dirname(specPath), now: () => new Date().toISOString(),
          });
          ensureResultsGitignore(join(opts.skillDir, "tests", "results"));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, step: "run", grade: written.effective_grade }));
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/save") {
        const body = JSON.parse((await readBody(req)) || "{}") as {
          col: number;
          scenarioId: string;
          override: Verdict | null;
          note: string;
        };
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) {
          res.writeHead(404).end("unknown column");
          return;
        }
        const results = readResults(column.runDir);
        let patched: ResultsFile;
        try {
          patched = applyOverride(results, body.scenarioId, body.override ?? null, body.note ?? "");
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          return;
        }
        // writeResults recomputes effective_grade override-aware against the CURRENT
        // spec's ship bar — a saved override can never leave a stale grade. Scored
        // modes only: /save must not put a grade on a red baseline (PR #1 finding),
        // and since 0.5.0 "scored" includes force.
        const spec = loadSpec(join(opts.skillDir, "tests", "specification.yaml"));
        writeResults(column.runDir, patched, scoreContextFor(patched, spec));
        // Unconditional: a results root created before schema-2/journal.jsonl existed
        // may still have a stale .gitignore body — every save (not just overrides)
        // must roll it forward so journal.jsonl doesn't end up tracked.
        ensureResultsGitignore(join(opts.skillDir, "tests", "results"));
        if (body.override != null) {
          preserveTranscript(join(opts.skillDir, "tests", "results"), column.runDir, body.scenarioId);
        }
        appendJournal(column.runDir, {
          event: "override", ts: new Date().toISOString(),
          id: body.scenarioId, override: body.override ?? null, note: body.note ?? "",
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404).end("not found");
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`server error: ${e instanceof Error ? e.message : e}`);
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  const link = `http://127.0.0.1:${port}/`;
  console.log(`\n  skill-harness review · ${opts.skillName}`);
  console.log(`  → ${link}`);
  console.log(`  flip verdicts + add notes in the browser; saves persist to results.yaml.`);
  console.log(`  Ctrl-C to stop.\n`);

  if (opts.open !== false && !envFlag("NO_OPEN")) tryOpen(link);

  return { port: port as number, close: () => server.close() };
}

export function tryOpen(url: string, cmd?: string): void {
  const opener = cmd ?? (process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open");
  try {
    const child = spawn(opener, [url], { stdio: "ignore", detached: true });
    // spawn emits 'error' asynchronously (e.g. xdg-open ENOENT in headless envs);
    // an unhandled 'error' event would crash the process — swallow it.
    child.on("error", () => {});
    child.unref();
  } catch {
    /* best effort */
  }
}
