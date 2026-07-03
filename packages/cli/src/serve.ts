import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  collectReport, renderReport,
  readResults, writeResults, applyOverride, preserveTranscript,
  appendJournal,
  type Verdict, type ResultsFile,
  loadSpec,
} from "@skill-check/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Locate assets/report.template.html relative to dist/ or src/. */
function templatePath(): string {
  const candidates = [
    join(__dirname, "..", "..", "..", "assets", "report.template.html"), // packages/cli/{dist,src} -> ../../../assets
    join(__dirname, "..", "assets", "report.template.html"),
    join(__dirname, "..", "..", "assets", "report.template.html"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("cannot find assets/report.template.html");
}

export interface ServeOptions {
  skillDir: string;
  skillName: string;
  port?: number;
  open?: boolean;
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

function findTranscript(runDir: string, id: string): string | null {
  if (!existsSync(runDir)) return null;
  const preferred = join(runDir, `${id}.green.txt`);
  if (existsSync(preferred)) return readFileSync(preferred, "utf8");
  const any = readdirSync(runDir).find((f) => f.startsWith(`${id}.`) && f.endsWith(".txt"));
  return any ? readFileSync(join(runDir, any), "utf8") : null;
}

export interface ServeHandle {
  port: number;
  close: () => void;
}

export async function serveReview(opts: ServeOptions): Promise<ServeHandle> {
  const template = readFileSync(templatePath(), "utf8");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/") {
        const data = collectReport(opts.skillDir);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderReport(template, data));
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
        // spec's ship bar — a saved override can never leave a stale grade. Only
        // green runs are scored (PR #1 finding: /save must not grade red/force runs).
        const spec = loadSpec(join(opts.skillDir, "tests", "specification.yaml"));
        const ctx = patched.mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
        writeResults(column.runDir, patched, ctx);
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
  console.log(`\n  skill-check review · ${opts.skillName}`);
  console.log(`  → ${link}`);
  console.log(`  flip verdicts + add notes in the browser; saves persist to results.yaml.`);
  console.log(`  Ctrl-C to stop.\n`);

  if (opts.open !== false && !process.env.SKILL_CHECK_NO_OPEN) tryOpen(link);

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
