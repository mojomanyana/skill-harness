import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Scenario } from "./spec.js";

export interface JudgeReference { file: string; sha256: string; text: string }
const LIMIT = 65_536;

/** Only explicitly selected local UTF-8 files are read. Never discover sibling files. */
export function resolveJudgeReferences(scenario: Scenario, specDir: string): JudgeReference[] {
  const selected = scenario.judgeReferences ?? [];
  if (!selected.length) return [];
  if (selected.length > 16 || new Set(selected).size !== selected.length) throw new Error("Invalid judge reference selection");
  const root = realpathSync(specDir);
  let total = 0;
  return selected.map(file => {
    if (!file || /[\\:\x00-\x1f]/.test(file) || file.startsWith("/") || file.split("/").some(part => !part || part === "." || part === "..")) throw new Error(`Unsafe judge reference: ${file}`);
    const path = realpathSync(resolve(root, file));
    const rel = relative(root, path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) throw new Error(`Judge reference escapes specification directory: ${file}`);
    const info = statSync(path);
    if (!info.isFile() || info.size > LIMIT) throw new Error(`Judge reference must be a regular file of at most ${LIMIT} bytes: ${file}`);
    const bytes = readFileSync(path);
    total += bytes.length;
    if (bytes.length > LIMIT || total > LIMIT) throw new Error(`Selected judge references exceed ${LIMIT} bytes`);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error(`Judge reference contains binary content: ${file}`);
    return { file, sha256: createHash("sha256").update(bytes).digest("hex"), text };
  });
}
