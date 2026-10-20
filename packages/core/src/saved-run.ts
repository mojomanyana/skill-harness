import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { readResults, findTranscriptFiles, transcriptPath } from "./results.js";
import type { Spec } from "./spec.js";
import { currentHashFor, isSupersededKey, sourceHashes } from "./sources.js";

export interface SavedAnswerPlan {
  providerCalls: 0;
  resultsChanged: false;
  scenarios: { id: string; action: "reuse" | "regrade" | "regate" | "rescore" | "rerun" | "inspect"; changed: string[]; note: string }[];
}

/** This is an input-identity plan, never an approval or a claim that a failed answer improved. */
export function planSavedAnswers(runDir: string, spec: Spec, skillDir: string, specDir: string): SavedAnswerPlan {
  const previous = readResults(runDir);
  const context = { skillDir, specDir, scenarios: spec.scenarios, judgePersona: spec.judge_persona };
  const recorded = previous.source_hashes;
  const current = sourceHashes(context);
  const changed = Object.keys({ ...recorded, ...current }).filter(key => {
    if (isSupersededKey(key, { ...recorded, ...current })) return false;
    return !recorded || !(key in recorded) || currentHashFor(key, context) !== recorded[key];
  });
  return { providerCalls: 0, resultsChanged: false, scenarios: spec.scenarios.map(s => {
    const prior = previous.scenarios.find(p => p.id === s.id);
    const relevant = changed.filter(key => {
      if (/^(stimulus|rubric|policy|gates|scenario):/.test(key) && key !== "rubric:__persona") return key.slice(key.indexOf(":") + 1) === s.id;
      if (key.startsWith("fixture:")) return key.slice(8) === (typeof s.workspace === "object" ? s.workspace.fixture : s.fixture);
      if (key.startsWith("prompt:")) return key.slice(7) === s.systemPromptFile;
      if (!key.includes(":") && key !== "SKILL.md") return [s.systemPromptFile, s.assert?.post_test, ...(s.extensions ?? [])].includes(key);
      return true;
    });
    const base = { id: s.id, changed: relevant };
    if (!prior) return { ...base, action: "rerun" as const, note: "No saved answer exists for this scenario." };
    const files = findTranscriptFiles(runDir, s.id, previous.mode);
    const reps = prior.reps ?? 1;
    const complete = Number.isSafeInteger(reps) && reps > 0 && files.length === reps && files.every((file, rep) => {
      if (file !== basename(transcriptPath(runDir, s.id, previous.mode, reps === 1 ? undefined : rep))) return false;
      try {
        const stat = lstatSync(join(runDir, file));
        return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0;
      } catch { return false; }
    });
    if (!complete) return { ...base, action: "inspect" as const, note: "Saved answers are incomplete; recover original evidence before planning paid work." };
    if (!recorded || !recorded[`stimulus:${s.id}`]) return { ...base, action: "inspect" as const, note: "Input identity is incomplete; do not assume a saved answer matches this task." };
    if (relevant.some(key => key in recorded && currentHashFor(key, context) === undefined)) return { ...base, action: "inspect" as const, note: "An input identity cannot be interpreted by this harness; inspect the original evidence before planning a rerun." };
    if (prior.judge_verdict === "ERROR") return { ...base, action: "inspect" as const, note: "Resolve transport/capture errors first; recover saved answers before considering another subject run." };
    const stimulusChanged = relevant.some(key => !/^(rubric|gates|policy):/.test(key));
    if (stimulusChanged) return { ...base, action: "rerun" as const, note: "Subject inputs or skill changed. Old answers remain historical and cannot establish current behavior." };
    if (relevant.some(k => k.startsWith("gates:"))) return { ...base, action: "regate" as const, note: "Replay supported assertions on saved evidence; missing execution evidence remains unknown. Regrade too if the rubric changed." };
    if (relevant.some(k => k.startsWith("rubric:"))) return { ...base, action: "regrade" as const, note: "Judge the saved answers against corrected references/rubric; no subject call is needed." };
    if (relevant.some(k => k.startsWith("policy:"))) return { ...base, action: "rescore" as const, note: "Recompute policy using retained verdicts; no provider calls." };
    return { ...base, action: "reuse" as const, note: "Inputs match. Retain the existing verdict, including failures; this is not a new stability sample." };
  }) };
}

/** Copy a selected run, with limits and byte identities, before revising its judgments. */
export function forkSavedRun(source: string, destination: string): string {
  const root = realpathSync(source), out = join(realpathSync(dirname(resolve(destination))), basename(destination));
  const rel = relative(root, out);
  if (!rel || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"))) throw new Error("Saved-run output must be outside the original run");
  const files: { path: string; bytes: number; sha256: string }[] = [];
  let bytes = 0, entries = 0;
  const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  const visit = (dir: string, prefix: string, depth: number) => {
    if (depth > 16) throw new Error("Saved-run copy exceeds directory depth limit");
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (++entries > 4096) throw new Error("Saved-run copy exceeds 4096 entries");
      const path = join(dir, entry.name), key = prefix + entry.name, stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Saved-run copy refuses symbolic links");
      if (stat.isDirectory()) visit(path, key + "/", depth + 1);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (stat.size > 64 * 1024 * 1024 || bytes > 256 * 1024 * 1024) throw new Error("Saved-run copy exceeds evidence byte limit; select a smaller run");
        files.push({ path: key, bytes: stat.size, sha256: sha(readFileSync(path)) });
      } else throw new Error("Saved-run copy requires regular files");
    }
  };
  visit(root, "", 0);
  if (!files.some(f => f.path === "results.yaml")) throw new Error("Saved run lacks results.yaml");
  mkdirSync(out, { mode: 0o700 }); // Exclusive: never overwrite another result directory.
  for (const file of files) {
    const data = readFileSync(join(root, file.path));
    if (sha(data) !== file.sha256) throw new Error("Saved evidence changed during copy; output is incomplete");
    const target = join(out, file.path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, data, { flag: "wx", mode: 0o600 });
  }
  for (const file of files) if (sha(readFileSync(join(root, file.path))) !== file.sha256 || sha(readFileSync(join(out, file.path))) !== file.sha256) throw new Error("Saved evidence verification failed; output is incomplete");
  writeFileSync(join(out, `reuse-source-${Date.now()}.json`), JSON.stringify({ schema: 1, purpose: "saved-answer-regrade", source: root, files, subjectCalls: 0 }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return out;
}
