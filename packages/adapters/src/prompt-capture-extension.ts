import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { observeProviderPayload } from "./prompt-provenance.js";
import type { PromptMechanism } from "@skill-harness/core";

interface PromptEvent { payload: unknown }
interface MinimalExtensionApi { on(name: "before_provider_request", handler: (event: PromptEvent) => void): void }
interface CaptureContract { text: string; mechanism: PromptMechanism }

/** Internal observation extension: hashes the final provider prompt in-process; never writes payload plaintext. */
export default function promptCapture(pi: MinimalExtensionApi): void {
  const target = process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE;
  const contractPath = process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE;
  if (!target || !contractPath) throw new Error("prompt capture paths are required");
  const contract = JSON.parse(readFileSync(contractPath, "utf8")) as CaptureContract;
  // Remove the capability before any subject/tool execution. The observer keeps
  // only closed-over values; child processes cannot discover contract/evidence paths.
  delete process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE;
  delete process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE;
  rmSync(contractPath, { force: true });
  let requestIndex = 0;
  pi.on("before_provider_request", (event) => {
    const observation = observeProviderPayload(event.payload, contract.text, contract.mechanism, requestIndex++);
    appendFileSync(target, JSON.stringify(observation) + "\n", { encoding: "utf8", mode: 0o600 });
  });
}
