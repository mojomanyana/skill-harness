import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import yaml from "js-yaml";
import { redactText } from "./redaction.js";
import { parseSpec } from "./spec.js";

export interface HarvestOptions {
  readonly sessionPath: string;
  readonly outDir: string;
  readonly skillName?: string;
  readonly scenarioId?: string;
  /** Exact user prompt of the turn to harvest (overrides selecting the first user prompt). */
  readonly prompt?: string;
  /** 0-based non-slash user turn index to harvest from a multi-turn session JSONL. */
  readonly turnIndex?: number;
  /** Optional turn-scoped metadata overrides (merged with or replacing session-wide extraction). */
  readonly editedFiles?: readonly string[];
  readonly verifyCommands?: readonly string[];
  readonly notes?: string;
  /** Always allocate a distinct capture directory even if the base skill directory already exists. */
  readonly unique?: boolean;
}

export interface HarvestResult {
  readonly skillName: string;
  readonly scenarioId: string;
  readonly specPath: string;
  readonly prompt: string;
  readonly editedFiles: string[];
  readonly verifyCommands: string[];
}

interface ParsedTurn {
  prompt: string;
  editedFiles: Set<string>;
  verifyCommands: string[];
  sawColdReviewBlocker: boolean;
  sawThrashHint: boolean;
}

function slug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "harvested-skill";
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((b: unknown): b is { type: string; text: string } =>
      Boolean(b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string"),
    )
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function parseSessionTurns(lines: readonly string[]): ParsedTurn[] {
  const turns: ParsedTurn[] = [];
  let current: ParsedTurn | undefined;

  for (const line of lines) {
    let row: Record<string, any>;
    try { row = JSON.parse(line); } catch { continue; }
    const msg = row.message ?? (row.type === "message" ? row.message : undefined);
    if (msg?.role === "user") {
      const text = extractUserText(msg.content);
      if (text && !text.startsWith("/")) {
        current = {
          prompt: text,
          editedFiles: new Set<string>(),
          verifyCommands: [],
          sawColdReviewBlocker: false,
          sawThrashHint: false,
        };
        turns.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (msg?.role === "assistant" && Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c?.type === "toolCall") {
          if ((c.name === "edit" || c.name === "write") && typeof c.arguments?.path === "string") {
            current.editedFiles.add(c.arguments.path);
          } else if (c.name === "bash" && typeof c.arguments?.command === "string") {
            const cmd = c.arguments.command.trim();
            if (/\b(npm\s+test|vitest|node\s+--test|pytest|cargo\s+test|go\s+test)\b/i.test(cmd)) {
              if (!current.verifyCommands.includes(cmd)) current.verifyCommands.push(cmd);
            }
          }
        }
      }
    }
    if (msg?.customType === "pi-daddy-cold-review") current.sawColdReviewBlocker = true;
    const rawStr = JSON.stringify(row);
    if (rawStr.includes("[Harness loop detector]")) current.sawThrashHint = true;
  }
  return turns;
}

function selectTurn(turns: readonly ParsedTurn[], options: HarvestOptions): ParsedTurn | undefined {
  if (options.turnIndex !== undefined) {
    if (!Number.isInteger(options.turnIndex) || options.turnIndex < 0 || options.turnIndex >= turns.length) {
      throw new Error(`Turn index ${options.turnIndex} out of range (session has ${turns.length} user turn(s))`);
    }
    return turns[options.turnIndex];
  }
  const wantedPrompt = options.prompt?.trim();
  if (wantedPrompt) {
    const exact = [...turns].reverse().find((t) => t.prompt === wantedPrompt || redactText(t.prompt) === wantedPrompt);
    if (exact) return exact;
    const prefix = wantedPrompt.slice(0, 120);
    const partial = [...turns].reverse().find((t) => t.prompt.includes(prefix) || redactText(t.prompt).includes(prefix));
    if (partial) return partial;
    return {
      prompt: wantedPrompt,
      editedFiles: new Set<string>(),
      verifyCommands: [],
      sawColdReviewBlocker: false,
      sawThrashHint: false,
    };
  }
  return turns[0];
}

function allocateSkillRoot(outDir: string, baseName: string, forceUnique: boolean): { dirName: string; skillRoot: string } {
  const absOut = resolve(outDir);
  if (!forceUnique) {
    const plain = join(absOut, baseName);
    if (!existsSync(join(plain, "tests", "specification.yaml"))) {
      return { dirName: baseName, skillRoot: plain };
    }
  }
  for (let attempt = 0; attempt < 16; attempt++) {
    const suffix = randomBytes(4).toString("hex");
    const dirName = `${baseName}-${suffix}`;
    const candidate = join(absOut, dirName);
    if (!existsSync(candidate)) return { dirName, skillRoot: candidate };
  }
  throw new Error(`Could not allocate a unique harvest directory under ${absOut}`);
}

/**
 * Harvest a real Pi session JSONL (or one specific classified turn) into a sanitized,
 * secret-redacted, schema-validated `specification.yaml` regression eval.
 */
export function harvestSessionToSpec(options: HarvestOptions): HarvestResult {
  const absSession = resolve(options.sessionPath);
  if (!existsSync(absSession)) throw new Error(`Session file not found: ${absSession}`);
  const lines = readFileSync(absSession, "utf8").split(/\r?\n/).filter(Boolean);
  const turns = parseSessionTurns(lines);
  const selected = selectTurn(turns, options);

  if (!selected?.prompt) throw new Error("No user prompt found in session JSONL");

  const scenarioId = options.scenarioId?.trim() || "H1";
  const baseSkill = slug(options.skillName ?? (options.scenarioId ? scenarioId : basename(absSession, ".jsonl")));
  const redactedPrompt = redactText(selected.prompt).slice(0, 4000);
  const rawEdits = options.editedFiles?.length ? [...options.editedFiles] : [...selected.editedFiles];
  const rawVerify = options.verifyCommands?.length ? [...options.verifyCommands] : [...selected.verifyCommands];
  const editedList = [...new Set(rawEdits.map((f) => redactText(f).trim()).filter(Boolean))].slice(0, 12);
  const verifyCommands = [...new Set(rawVerify.map((c) => redactText(c).trim()).filter(Boolean))].slice(0, 8);
  const redactedNotes = options.notes ? redactText(options.notes).trim().slice(0, 400) : "";

  const checklist = [
    "Satisfies every explicit requirement in the user prompt",
    ...(editedList.length ? [`Modifies the relevant target file(s) cleanly (${editedList.slice(0, 4).join(", ")})`] : []),
    ...(verifyCommands.length ? [`Runs executable verification checks and confirms they pass (${verifyCommands[0].slice(0, 160)})`] : []),
    ...(selected.sawColdReviewBlocker ? ["Avoids defects previously flagged by cold diff review"] : []),
    ...(selected.sawThrashHint ? ["Resolves edge cases cleanly without thrashing on repeated test failures"] : []),
    ...(redactedNotes ? [`Addresses harvested failure mode: ${redactedNotes}`] : []),
  ];

  const { dirName, skillRoot } = allocateSkillRoot(options.outDir, baseSkill, Boolean(options.unique));
  const title = redactText(`Harvested (${scenarioId}) from ${basename(absSession)}`).slice(0, 140);
  const spec = {
    skill: dirName,
    judge_persona: "rigorous senior engineer grading exact functional correctness, edge cases, and clean verification",
    ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
    critical: [scenarioId],
    scenarios: [
      {
        id: scenarioId,
        title,
        critical: true,
        turns: [redactedPrompt],
        checklist,
      },
    ],
  };

  const yamlText = yaml.dump(spec, { lineWidth: 120 });
  const testsDir = join(skillRoot, "tests");
  const specPath = join(testsDir, "specification.yaml");
  // Fail closed: validate through Harness's own spec loader before writing to disk.
  parseSpec(yamlText, specPath);

  mkdirSync(testsDir, { recursive: true });
  writeFileSync(specPath, yamlText, { encoding: "utf8", flag: "wx" });
  const skillMd = join(skillRoot, "SKILL.md");
  if (!existsSync(skillMd)) {
    writeFileSync(
      skillMd,
      `---\nname: ${dirName}\ndescription: Use when handling tasks similar to harvested scenario ${scenarioId}.\n---\n# ${dirName}\n\nHarvested regression skill placeholder.\n`,
      "utf8",
    );
  }
  return { skillName: dirName, scenarioId, specPath, prompt: redactedPrompt, editedFiles: editedList, verifyCommands };
}
