/**
 * CLI commands guaranteed to make no subject or judge calls.
 *
 * Keep this list narrow: commands that can conditionally spend (notably `regate`)
 * do not belong here even when their common path only replays saved artifacts.
 */
export const FREE_OFFLINE_COMMANDS = [
  "affected",
  "coverage",
  "init",
  "judge-agreement",
  "lint",
  "list",
  "mutation-test",
  "rescore",
  "restamp",
  "stability",
] as const;

export type FreeOfflineCommand = typeof FREE_OFFLINE_COMMANDS[number];

export function isFreeOfflineCommand(command: string): command is FreeOfflineCommand {
  return FREE_OFFLINE_COMMANDS.some((candidate) => candidate === command);
}
