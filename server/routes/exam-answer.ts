/**
 * POST /api/exam/answer — upserts one answer.
 * Rejects after ends_at + GRACE (lazy-finalizes the attempt first).
 */
import { z } from "zod";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { getSettings, nowSec } from "../db";
import {
  getAttemptByParticipant,
  getAttemptById,
  ensureNotExpired,
  parseQuestionOrder,
  GRACE_SECONDS,
} from "../attempt";
import { requireParticipantClaims, ensureAttemptSession } from "../auth";

const schema = z.object({
  questionId: z.string().min(1),
  selectedOption: z.enum(["A", "B", "C", "D"]).nullable(),
});

export async function handleExamAnswer(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  const body = await readJson(request, schema);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");

  const settings = await getSettings(db);
  const now = nowSec();
  const attempt = await ensureNotExpired(db, attemptRow, now, settings);

  if (attempt.status !== "in_progress") {
    throw new ApiError(409, "already_submitted", "This attempt has already been submitted.");
  }
  if (now > attempt.ends_at + GRACE_SECONDS) {
    throw new ApiError(403, "exam_ended", "The exam time is over.");
  }

  // The question must be part of this attempt's stored order.
  const order = parseQuestionOrder(attempt.question_order);
  if (!order.some((o) => o.qid === body.questionId)) {
    throw new ApiError(400, "unknown_question", "This question is not part of your exam.");
  }

  await db.execute({
    sql: `INSERT INTO answers (attempt_id, question_id, selected_option, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(attempt_id, question_id)
          DO UPDATE SET selected_option = excluded.selected_option, updated_at = excluded.updated_at`,
    args: [attempt.id, body.questionId, body.selectedOption, now],
  });

  const countRows = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM answers WHERE attempt_id = ? AND selected_option IS NOT NULL",
    args: [attempt.id],
  });

  return json({ ok: true, answeredCount: Number(countRows.rows[0]?.n ?? 0) });
}

/** GET /api/exam/heartbeat (also POST) — lightweight resume/reconnect check. */
export async function handleExamHeartbeat(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const attempt = await ensureNotExpired(db, attemptRow, undefined, settings);
  return json({
    serverTime: Date.now(),
    status: attempt.status,
    remainingSeconds: Math.max(0, attempt.ends_at - nowSec()),
    violations: attempt.violation_count,
  });
}

// Re-export for route files.
export { getAttemptById };
