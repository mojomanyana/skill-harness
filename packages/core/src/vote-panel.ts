import type { Verdict } from "./score.js";

/** Domain-neutral vote shape shared by ordinary adjudication and qualification panels. */
export interface PanelVote {
  ordinal: number;
  verdict: Verdict;
  suspect: boolean;
}

export interface VotePanelCollapse {
  state: "confirmed" | "tie_broken" | "unresolved";
  verdict?: "PASS" | "FAIL";
  clean_votes: number;
  pass_votes: number;
  fail_votes: number;
  /** True only when the first two answers are both clean and oppose one another. */
  split: boolean;
  /** Minority clean votes / all clean votes; zero when there is no minority. */
  minority_rate: number;
}

export function isCleanPanelVote(vote: PanelVote): vote is PanelVote & { verdict: "PASS" | "FAIL" } {
  return !vote.suspect && (vote.verdict === "PASS" || vote.verdict === "FAIL");
}

/**
 * One collapse rule for both skill-harness adjudication and qualification.
 * Invalid, ambiguous, and suspect answers remain evidence but are never votes.
 */
export function collapseVotePanel(votes: readonly PanelVote[]): VotePanelCollapse {
  const clean = votes.filter(isCleanPanelVote);
  const passVotes = clean.filter((vote) => vote.verdict === "PASS").length;
  const failVotes = clean.length - passVotes;
  const firstTwo = votes.filter((vote) => vote.ordinal === 1 || vote.ordinal === 2);
  const split = firstTwo.length === 2 && firstTwo.every(isCleanPanelVote) && firstTwo[0].verdict !== firstTwo[1].verdict;
  const minority = Math.min(passVotes, failVotes);
  const base = {
    clean_votes: clean.length,
    pass_votes: passVotes,
    fail_votes: failVotes,
    split,
    minority_rate: clean.length === 0 ? 0 : minority / clean.length,
  };

  if (clean.length < 2) return { ...base, state: "unresolved" };
  if (passVotes === 0 || failVotes === 0) return { ...base, state: "confirmed", verdict: clean[0].verdict };
  if (passVotes > failVotes) return { ...base, state: "tie_broken", verdict: "PASS" };
  if (failVotes > passVotes) return { ...base, state: "tie_broken", verdict: "FAIL" };
  return { ...base, state: "unresolved" };
}

export async function runVotePanel<T extends PanelVote>(options: {
  cast: (ordinal: 1 | 2 | 3) => Promise<T>;
}): Promise<{ votes: T[]; collapse: VotePanelCollapse; calls_made: number }> {
  const votes = [await options.cast(1), await options.cast(2)];
  let collapse = collapseVotePanel(votes);
  if (collapse.split) {
    votes.push(await options.cast(3));
    collapse = collapseVotePanel(votes);
  }
  return { votes, collapse, calls_made: votes.length };
}
