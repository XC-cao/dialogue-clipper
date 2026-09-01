export interface MissingHighlightAttempt {
  count: number;
  firstMissingAt: number;
}

export function recordMissingHighlight(previous: MissingHighlightAttempt | undefined, now: number): MissingHighlightAttempt {
  return previous
    ? { count: previous.count + 1, firstMissingAt: previous.firstMissingAt }
    : { count: 1, firstMissingAt: now };
}

export function isMissingHighlightConfirmed(
  attempt: MissingHighlightAttempt,
  now: number,
  confirmations: number,
  graceMs: number
): boolean {
  return attempt.count >= confirmations && now - attempt.firstMissingAt >= graceMs;
}
