/**
 * Attempt lifecycle: load, lazy-finalize expired attempts, and finalize
 * (idempotent) with server-side scoring.
 */
import type { Client, InStatement } from "@libsql/client";
import { getSettings, nowSec, type Settings } from "./db";
import { computeScore, timeTakenSeconds } from "./scoring";

export const GRACE_SECONDS = 10;

export type SubmitReason = "manual" | "time_up" | "violations" | "admin";

export type AttemptRow = {
  id: string;
  participant_id: string;
  status: "in_progress" | "submitted";
  submit_reason: SubmitReason | null;
  started_at: number;
  ends_at: number;
  submitted_at: number | null;
  question_order: string;
  session_id: string;
  score: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  unanswered_count: number | null;
  time_taken_seconds: number | null;
  violation_count: number;
  ip_address: string | null;
  user_agent: string | null;
};

type RawRow = Record<string, unknown>;

export function mapAttempt(row: RawRow): AttemptRow {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    status: row.status === "submitted" ? "submitted" : "in_progress",
    submit_reason: (row.submit_reason as SubmitReason | null) ?? null,
    started_at: Number(row.started_at),
    ends_at: Number(row.ends_at),
    submitted_at: row.submitted_at == null ? null : Number(row.submitted_at),
    question_order: String(row.question_order),
    session_id: String(row.session_id),
    score: row.score == null ? null : Number(row.score),
    correct_count: row.correct_count == null ? null : Number(row.correct_count),
    wrong_count: row.wrong_count == null ? null : Number(row.wrong_count),
    unanswered_count: row.unanswered_count == null ? null : Number(row.unanswered_count),
    time_taken_seconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
    violation_count: Number(row.violation_count ?? 0),
    ip_address: row.ip_address == null ? null : String(row.ip_address),
    user_agent: row.user_agent == null ? null : String(row.user_agent),
  };
}

export async function getAttemptByParticipant(
  db: Client,
  participantId: string,
): Promise<AttemptRow | null> {
  const result = await db.execute({
    sql: "SELECT * FROM attempts WHERE participant_id = ?",
    args: [participantId],
  });
  const row = result.rows[0];
  return row ? mapAttempt(row as unknown as RawRow) : null;
}

export async function getAttemptById(db: Client, attemptId: string): Promise<AttemptRow | null> {
  const result = await db.execute({
    sql: "SELECT * FROM attempts WHERE id = ?",
    args: [attemptId],
  });
  const row = result.rows[0];
  return row ? mapAttempt(row as unknown as RawRow) : null;
}

export type ParsedOrder = Array<{ qid: string; options: Array<"A" | "B" | "C" | "D"> }>;

export function parseQuestionOrder(json: string): ParsedOrder {
  try {
    const parsed = JSON.parse(json) as ParsedOrder;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.qid === "string" && Array.isArray(e.options))
      .map((e) => ({ qid: e.qid, options: e.options as Array<"A" | "B" | "C" | "D"> }));
  } catch {
    return [];
  }
}

/**
 * Lazy finalization — call on ANY request that touches an attempt.
 * If the attempt is in_progress and past its deadline + grace, finalize it
 * with reason "time_up" and return the fresh row.
 */
export async function ensureNotExpired(
  db: Client,
  attempt: AttemptRow,
  now: number = nowSec(),
  settings?: Settings,
): Promise<AttemptRow> {
  if (attempt.status === "in_progress" && now > attempt.ends_at + GRACE_SECONDS) {
    return finalizeAttempt(db, attempt.id, "time_up", Math.max(now, attempt.ends_at), settings);
  }
  return attempt;
}

/**
 * Finalizes an attempt from its saved answers. Idempotent: if already
 * submitted, the existing row is returned unchanged.
 */
export async function finalizeAttempt(
  db: Client,
  attemptId: string,
  reason: SubmitReason,
  submittedAtSec: number = nowSec(),
  settings?: Settings,
): Promise<AttemptRow> {
  const existing = await getAttemptById(db, attemptId);
  if (!existing) throw new Error(`Attempt ${attemptId} not found`);
  if (existing.status === "submitted") return existing;

  const s = settings ?? (await getSettings(db));
  const order = parseQuestionOrder(existing.question_order);
  const qids = order.map((o) => o.qid);

  const correctByKey = new Map<string, string>();
  if (qids.length > 0) {
    const placeholders = qids.map(() => "?").join(",");
    const stmt: InStatement = {
      sql: `SELECT id, correct_option FROM questions WHERE id IN (${placeholders})`,
      args: qids,
    };
    const result = await db.execute(stmt);
    for (const row of result.rows) {
      correctByKey.set(String(row.id), String(row.correct_option));
    }
  }

  const answers = new Map<string, string | null>();
  const answerRows = await db.execute({
    sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
    args: [attemptId],
  });
  for (const row of answerRows.rows) {
    answers.set(
      String(row.question_id),
      row.selected_option == null ? null : String(row.selected_option),
    );
  }

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const { qid } of order) {
    const selected = answers.get(qid) ?? null;
    if (!selected) {
      unanswered += 1;
    } else if (selected === correctByKey.get(qid)) {
      correct += 1;
    } else {
      wrong += 1;
    }
  }

  const durationSec = s.durationMinutes * 60;
  const submittedAt =
    reason === "time_up" ? Math.min(submittedAtSec, existing.ends_at) : submittedAtSec;
  const scored = computeScore(
    { correct, wrong, unanswered },
    {
      marksCorrect: s.marksCorrect,
      marksWrong: s.marksWrong,
      clampAtZero: s.clampScoreAtZero,
    },
  );
  const taken = timeTakenSeconds(existing.started_at, submittedAt, durationSec);

  await db.execute({
    sql: `UPDATE attempts
          SET status = 'submitted',
              submit_reason = ?,
              submitted_at = ?,
              score = ?,
              correct_count = ?,
              wrong_count = ?,
              unanswered_count = ?,
              time_taken_seconds = ?
          WHERE id = ? AND status = 'in_progress'`,
    args: [
      reason,
      submittedAt,
      scored.score,
      scored.correct,
      scored.wrong,
      scored.unanswered,
      taken,
      attemptId,
    ],
  });

  const fresh = await getAttemptById(db, attemptId);
  return (
    fresh ?? { ...existing, status: "submitted", submit_reason: reason, submitted_at: submittedAt }
  );
}

/**
 * Finalizes every expired in-progress attempt (cron sweeper + admin list).
 * Returns how many attempts were finalized.
 */
export async function finalizeExpiredAttempts(db: Client, now: number = nowSec()): Promise<number> {
  const result = await db.execute({
    sql: "SELECT id FROM attempts WHERE status = 'in_progress' AND ends_at + ? < ?",
    args: [GRACE_SECONDS, now],
  });
  let count = 0;
  for (const row of result.rows) {
    await finalizeAttempt(db, String(row.id), "time_up", now);
    count += 1;
  }
  return count;
}

/** Any attempt currently being taken blocks question edits / replace-all imports. */
export async function hasAttemptInProgress(db: Client): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT 1 FROM attempts WHERE status = 'in_progress' LIMIT 1",
    args: [],
  });
  return result.rows.length > 0;
}
