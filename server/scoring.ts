/**
 * Scoring — pure functions (server-side only; correct answers never leave here).
 * score = correct × marks_correct + wrong × marks_wrong (unanswered = 0)
 * Clamped at 0 only when settings.clamp_score_at_zero is 1.
 */
export type ScoreCounts = {
  correct: number;
  wrong: number;
  unanswered: number;
};

export type ScoreResult = {
  score: number;
  correct: number;
  wrong: number;
  unanswered: number;
};

export function computeScore(
  counts: ScoreCounts,
  marks: { marksCorrect: number; marksWrong: number; clampAtZero: boolean },
): ScoreResult {
  const raw = counts.correct * marks.marksCorrect + counts.wrong * marks.marksWrong;
  const score = marks.clampAtZero ? Math.max(0, raw) : raw;
  return {
    score: Math.round(score * 100) / 100, // avoid float artifacts like 72.49999999
    correct: counts.correct,
    wrong: counts.wrong,
    unanswered: counts.unanswered,
  };
}

export function timeTakenSeconds(
  startedAtSec: number,
  submittedAtSec: number,
  durationSec: number,
): number {
  return Math.min(Math.max(0, submittedAtSec - startedAtSec), durationSec);
}
