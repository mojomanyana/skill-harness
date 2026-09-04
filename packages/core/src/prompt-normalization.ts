import { createHash } from "node:crypto";

export const PROMPT_NORMALIZATION_RULE = "cwd-line-v1" as const;
export const PROMPT_NORMALIZATION_PATTERN = "^(Current working directory:)[^\\r\\n]*(\\r?)$";
export const PROMPT_NORMALIZATION_FLAGS = "gm";
export const PROMPT_NORMALIZATION_REPLACEMENT = "$1<normalized>$2";
export const PROMPT_NORMALIZATION_SOURCE_KEY = "observation:prompt-normalization";
export const PROMPT_NORMALIZATION_SOURCE_DIGEST = createHash("sha256").update(JSON.stringify([
  "prompt-normalization-registry",
  PROMPT_NORMALIZATION_RULE,
  PROMPT_NORMALIZATION_PATTERN,
  PROMPT_NORMALIZATION_FLAGS,
  PROMPT_NORMALIZATION_REPLACEMENT,
])).digest("hex");
