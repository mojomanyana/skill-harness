import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import yaml from "js-yaml";
import { redactText } from "./redaction.js";

export interface HarvestOptions {
  readonly sessionPath: string;
  readonly outDir: string;
  readonly skillName?: string;
  readonly scenarioId?: string;
}

export interface HarvestResult {
  readonly skillName: string;
  readonly specPath: string;
  readonly prompt: string;
  readonly editedFiles: string[];
  readonly verifyCommands: string[];
}

function slug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "harvested-skill";
}

/**
 * Harvest a real Pi session JSONL into a sanitized, secret-redacted `specification.yaml`
 * regression eval so real-world failures automatically become reproducible benchmark cases.
 */
export function harvestSessionToSpec(options: HarvestOptions): HarvestResult {
  const absSession = resolve(options.sessionPath);
  if (!existsSync(absSession)) throw new Error(`Session file not found: ${absSession}`);
  const lines = readFileSync(absSession, "utf8").split(/\r?\n/).filter(Boolean);

  let firstUserPrompt = "";
  const editedFiles = new Set<string>();
  const verifyCommands: string[] = [];
  let sawColdReviewBlocker = false;
  let sawThrashHint = false;

  for (const line of lines) {
    let row: Record<string, any>;
    try { row = JSON.parse(line); } catch { continue; }
    const msg = row.message ?? (row.type === "message" ? row.message : undefined);
    if (!firstUserPrompt && msg?.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content.trim()
          : (Array.isArray(msg.content) ? msg.content : [])
              .filter((b: any) => b?.type === "text" && typeof b.text === "string")
              .map((b: any) => b.text)
              .join("\n")
              .trim();
      if (text && !text.startsWith("/")) firstUserPrompt = text;
    }
    if (msg?.role === "assistant" && Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c?.type === "toolCall") {
          if ((c.name === "edit" || c.name === "write") && typeof c.arguments?.path === "string") {
            editedFiles.add(c.arguments.path);
          } else if (c.name === "bash" && typeof c.arguments?.command === "string") {
            const cmd = c.arguments.command.trim();
            if (/\b(npm\s+test|vitest|node\s+--test|pytest|cargo\s+test|go\s+test)\b/i.test(cmd)) {
              if (!verifyCommands.includes(cmd)) verifyCommands.push(cmd);
            }
          }
        }
      }
    }
    if (msg?.customType === "pi-daddy-cold-review") sawColdReviewBlocker = true;
    const rawStr = JSON.stringify(row);
    if (rawStr.includes("[Harness loop detector]")) sawThrashHint = true;
  }

  if (!firstUserPrompt) throw new Error("No user prompt found in session JSONL");

  const skillName = slug(options.skillName ?? basename(absSession, ".jsonl"));
  const scenarioId = options.scenarioId ?? "H1";
  const redactedPrompt = redactText(firstUserPrompt).slice(0, 4000);
  const editedList = [...editedFiles].slice(0, 12);

  const checklist = [
    "Satisfies every explicit requirement in the user prompt",
    ...(editedList.length ? [`Modifies the relevant target file(s) cleanly (${editedList.slice(0, 4).join(", ")})`] : []),
    ...(verifyCommands.length ? ["Runs executable verification checks and confirms they pass"] : []),
    ...(sawColdReviewBlocker ? ["Avoids defects previously flagged by cold diff review"] : []),
    ...(sawThrashHint ? ["Resolves edge cases cleanly without thrashing on repeated test failures"] : []),
  ];

  const spec = {
    skill: skillName,
    judge_persona: "rigorous senior engineer grading exact functional correctness, edge cases, and clean verification",
    ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
    critical: [scenarioId],
    scenarios: [
      {
        id: scenarioId,
        title: `Harvested from ${basename(absSession)}`,
        critical: true,
        turns: [redactedPrompt],
        checklist,
      },
    ],
  };

  const skillRoot = resolve(options.outDir, skillName);
  const testsDir = join(skillRoot, "tests");
  mkdirSync(testsDir, { recursive: true });
  const specPath = join(testsDir, "specification.yaml");
  writeFileSync(specPath, yaml.dump(spec, { lineWidth: 100 }), "utf8");
  const skillMd = join(skillRoot, "SKILL.md");
  if (!existsSync(skillMd)) {
    writeFileSync(
      skillMd,
      `---\nname: ${skillName}\ndescription: Use when handling tasks similar to harvested session ${basename(absSession)}.\n---\n# ${skillName}\n\nHarvested regression skill placeholder.\n`,
      "utf8",
    );
  }
  return { skillName, specPath, prompt: redactedPrompt, editedFiles: editedList, verifyCommands };
}
