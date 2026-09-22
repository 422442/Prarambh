/** GET /api/exam/status — exam state, settings summary, attempt state, server time. */
import type { Client } from "@libsql/client";
import { json, ApiError, type ServerEnv } from "../http";
import { getSettings } from "../db";
import { getAttemptByParticipant, ensureNotExpired, parseQuestionOrder } from "../attempt";
import { requireParticipantClaims, ensureAttemptSession } from "../auth";

export async function handleExamStatus(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  const claims = await requireParticipantClaims(request, env);
  const settings = await getSettings(db);

  const participantRows = await db.execute({
    sql: "SELECT terms_accepted_at, camera_consent_at, terms_version FROM participants WHERE id = ?",
    args: [claims.sub],
  });
  const participant = participantRows.rows[0];
  if (!participant) throw new ApiError(401, "unauthorized", "Please log in to continue.");

  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  const attempt = attemptRow ? await ensureNotExpired(db, attemptRow, undefined, settings) : null;

  const activeCount = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: [],
  });
  const activeQuestionCount = Number(activeCount.rows[0]?.n ?? 0);

  const answers: Record<string, string | null> = {};
  if (attempt) {
    const rows = await db.execute({
      sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
      args: [attempt.id],
    });
    for (const row of rows.rows) {
      answers[String(row.question_id)] =
        row.selected_option == null ? null : String(row.selected_option);
    }
  }

  const order = attempt ? parseQuestionOrder(attempt.question_order) : [];

  return json({
    serverTime: Date.now(),
    examOpen: settings.examOpen,
    activeQuestionCount,
    settings: {
      durationMinutes: settings.durationMinutes,
      questionCount: settings.questionCount,
      maxViolations: settings.maxViolations,
      snapshotIntervalSeconds: settings.snapshotIntervalSeconds,
    },
    terms: {
      accepted: participant.terms_accepted_at != null,
      cameraConsent: participant.camera_consent_at != null,
      version: participant.terms_version == null ? null : String(participant.terms_version),
    },
    attempt: attempt
      ? {
          status: attempt.status,
          submitReason: attempt.submit_reason,
          startedAt: attempt.started_at,
          endsAt: attempt.ends_at,
          submittedAt: attempt.submitted_at,
          remainingSeconds: Math.max(0, attempt.ends_at - Math.floor(Date.now() / 1000)),
          violations: attempt.violation_count,
          questionIds: order.map((o) => o.qid),
          answers,
        }
      : null,
  });
}
