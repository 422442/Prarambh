/**
 * GET /api/admin/participants/:id — participant detail: attempt summary,
 * per-question answers (chosen vs correct), violation timeline, snapshots.
 * POST variant handled by admin-reset.ts.
 */
import type { Client } from "@libsql/client";
import { json, ApiError, type ServerEnv } from "../http";
import { requireAdmin } from "../auth";
import { getAttemptByParticipant, ensureNotExpired, parseQuestionOrder } from "../attempt";

export async function handleAdminParticipantDetail(
  request: Request,
  db: Client,
  env: ServerEnv,
  participantId: string,
): Promise<Response> {
  await requireAdmin(request, env);

  const pRows = await db.execute({
    sql: "SELECT id, name, email, last_login_name, terms_version, terms_accepted_at, camera_consent_at, created_at FROM participants WHERE id = ?",
    args: [participantId],
  });
  const p = pRows.rows[0];
  if (!p) throw new ApiError(404, "not_found", "Participant not found.");

  const attemptRow = await getAttemptByParticipant(db, participantId);
  const attempt = attemptRow ? await ensureNotExpired(db, attemptRow) : null;

  // Answers with chosen vs correct (admin only).
  const answers: Array<{
    questionId: string;
    text: string;
    options: Record<string, string>;
    chosen: string | null;
    correct: string | null;
    result: "correct" | "wrong" | "unanswered";
  }> = [];

  if (attempt) {
    const order = parseQuestionOrder(attempt.question_order);
    const savedAnswers = new Map<string, string | null>();
    const aRows = await db.execute({
      sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
      args: [attempt.id],
    });
    for (const row of aRows.rows) {
      savedAnswers.set(
        String(row.question_id),
        row.selected_option == null ? null : String(row.selected_option),
      );
    }

    for (const entry of order) {
      const q = await db.execute({
        sql: "SELECT id, text, option_a, option_b, option_c, option_d, correct_option FROM questions WHERE id = ?",
        args: [entry.qid],
      });
      const qRow = q.rows[0];
      if (!qRow) continue;
      const chosen = savedAnswers.get(entry.qid) ?? null;
      const correct = String(qRow.correct_option);
      answers.push({
        questionId: entry.qid,
        text: String(qRow.text),
        options: {
          A: String(qRow.option_a),
          B: String(qRow.option_b),
          C: String(qRow.option_c),
          D: String(qRow.option_d),
        },
        chosen,
        correct,
        result: !chosen ? "unanswered" : chosen === correct ? "correct" : "wrong",
      });
    }
  }

  const violations = await db.execute({
    sql: "SELECT id, type, occurred_at, meta FROM violations WHERE attempt_id = ? ORDER BY occurred_at ASC",
    args: [attempt?.id ?? "none"],
  });

  const snapshots = await db.execute({
    sql: "SELECT id, blob_url, kind, face_count, taken_at FROM snapshots WHERE attempt_id = ? ORDER BY taken_at ASC",
    args: [attempt?.id ?? "none"],
  });

  return json({
    participant: {
      id: String(p.id),
      name: String(p.name),
      email: String(p.email),
      lastLoginName: p.last_login_name == null ? null : String(p.last_login_name),
      nameMismatch: p.last_login_name != null && String(p.last_login_name) !== String(p.name),
      termsVersion: p.terms_version == null ? null : String(p.terms_version),
      termsAcceptedAt: p.terms_accepted_at == null ? null : Number(p.terms_accepted_at),
      cameraConsentAt: p.camera_consent_at == null ? null : Number(p.camera_consent_at),
      createdAt: Number(p.created_at),
    },
    attempt: attempt
      ? {
          id: attempt.id,
          status: attempt.status,
          submitReason: attempt.submit_reason,
          startedAt: attempt.started_at,
          endsAt: attempt.ends_at,
          submittedAt: attempt.submitted_at,
          score: attempt.score,
          correct: attempt.correct_count,
          wrong: attempt.wrong_count,
          unanswered: attempt.unanswered_count,
          timeTakenSeconds: attempt.time_taken_seconds,
          violations: attempt.violation_count,
          ipAddress: attempt.ip_address,
          userAgent: attempt.user_agent,
        }
      : null,
    answers,
    violations: violations.rows.map((row) => ({
      id: String(row.id),
      type: String(row.type),
      occurredAt: Number(row.occurred_at),
      meta: row.meta == null ? null : String(row.meta),
    })),
    snapshots: snapshots.rows.map((row) => ({
      id: String(row.id),
      url: String(row.blob_url),
      kind: String(row.kind),
      faceCount: row.face_count == null ? null : Number(row.face_count),
      takenAt: Number(row.taken_at),
    })),
  });
}
