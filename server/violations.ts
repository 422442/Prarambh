/**
 * Violation counting rules (server-authoritative; the client only reports).
 *
 * - Burst window: events fired together by ONE action (e.g. exiting fullscreen
 *   also blurs the window) count as a single violation.
 * - Same-type window: the same type is counted at most once per 5 seconds.
 */
export const VIOLATION_TYPES = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "no_face",
  "multiple_faces",
  "camera_lost",
  "devtools",
  "other",
] as const;

export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const BURST_WINDOW_MS = 1500;
export const SAME_TYPE_WINDOW_MS = 5000;

export type ViolationTimestamps = {
  /** occurred_at (ms) of the participant's most recent violation, any type. */
  lastAnyAtMs: number | null;
  /** occurred_at (ms) of the most recent violation of the SAME type. */
  lastSameTypeAtMs: number | null;
};

export function shouldCountViolation(prev: ViolationTimestamps, nowMs: number): boolean {
  if (prev.lastAnyAtMs !== null && nowMs - prev.lastAnyAtMs < BURST_WINDOW_MS) return false;
  if (prev.lastSameTypeAtMs !== null && nowMs - prev.lastSameTypeAtMs < SAME_TYPE_WINDOW_MS)
    return false;
  return true;
}

/** Attempt is auto-submitted when its violation_count reaches max. */
export function isAutoSubmit(count: number, maxViolations: number): boolean {
  return count >= maxViolations;
}
