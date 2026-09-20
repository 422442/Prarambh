/**
 * POST /api/exam/start — creates or resumes an attempt.
 *
 * Gates: exam_open = 1, exactly question_count active questions, terms +
 * camera consent accepted. Creates (started_at, ends_at, shuffled
 * question_order, session rotation) or resumes (stored order + remaining
 * time). NEVER returns correct_option.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { getSettings, nowSec } from "../db";
import {
  getAttemptByParticipant,
  getAttemptById,
  ensureNotExpired,
  parseQuestionOrder,
} from "../attempt";
import { requireParticipantClaims, signToken, participantSetCookie, PARTICIPANT_MAX_AGE } from "../auth";
import { buildQuestionOrder } from "../shuffle";

const schema = z.object({}).optional();

export type StartQuestion = {
  id: string;
  text: string;
  options: Array<{ key: "A" | "B" | "C" | "D"; text: string }>;
};

function ipOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

function uaOf(request: Request): string {
  return request.headers.get("user-agent") ?? "";
}

export async function handleExamStart(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  await readJson(request, schema);
  const claims = await requireParticipantClaims(request, env);
  const now = nowSec();
  const settings = await getSettings(db);

  const participantRows = await db.execute({
    sql: "SELECT id, name, terms_accepted_at, camera_consent_at FROM participants WHERE id = ?",
    args: [claims.sub],
  });
  const participant = participantRows.rows[0];
  if (!participant) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  if (participant.terms_accepted_at == null || participant.camera_consent_at == null) {
    throw new ApiError(403, "terms_required", "Terms and camera consent must be accepted first.");
  }
  if (!settings.examOpen) {
    throw new ApiError(403, "exam_closed", "The exam is not open right now.");
  }
  const activeRows = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: [],
  });
  if (Number(activeRows.rows[0]?.n ?? 0) !== settings.questionCount) {
    throw new ApiError(
      403,
      "questions_incomplete",
      `The exam requires exactly ${settings.questionCount} active questions.`,
    );
  }

  const existing = await getAttemptByParticipant(db, claims.sub);
  const freshExisting = existing ? await ensureNotExpired(db, existing, now, settings) : null;
  if (freshExisting?.status === "submitted") {
    throw new ApiError(409, "already_submitted", "This email has already been used to complete the exam.");
  }


  let attempt = freshExisting;
  let resumed = attempt != null;

  if (attempt) {
    // Resume: rotate the session so the newest tab/device wins.
    const sid = nanoid();
    await db.execute({
      sql: "UPDATE attempts SET session_id = ?, ip_address = COALESCE(ip_address, ?), user_agent = COALESCE(user_agent, ?) WHERE id = ?",
      args: [sid, ipOf(request), uaOf(request), attempt.id],
    });
    const token = await signToken(env.sessionSecret, { sub: claims.sub, sid }, PARTICIPANT_MAX_AGE);
    attempt = await getAttemptById(db, attempt.id);
    attempt = attempt ? { ...attempt, session_id: sid } : attempt;
    return respondWithExam(db, env, request, claims.sub, attempt, resumed, settings, token);
  }

  // Create: the server owns the clock from this instant.
  const startedAt = now;
  const endsAt = startedAt + settings.durationMinutes * 60;
  const activeQuestions = await db.execute({
    sql: "SELECT id FROM questions WHERE is_active = 1",
    args: [],
  });
  const order = buildQuestionOrder(activeQuestions.rows.map((r) => ({ id: String(r.id) })));
  const attemptId = nanoid();
  const sid = nanoid();
  await db.execute({
    sql: `INSERT INTO attempts (id, participant_id, status, started_at, ends_at, question_order, session_id, violation_count, ip_address, user_agent)
          VALUES (?, ?, 'in_progress', ?, ?, ?, ?, 0, ?, ?)`,
    args: [attemptId, claims.sub, startedAt, endsAt, JSON.stringify(order), sid, ipOf(request), uaOf(request)],
  });
  attempt = await getAttemptById(db, attemptId);
  const token = await signToken(env.sessionSecret, { sub: claims.sub, sid }, PARTICIPANT_MAX_AGE);
  return respondWithExam(db, env, request, claims.sub, attempt, false, settings, token);
}

/** Assembles the question payload (NO correct_option) and returns the response. */
async function respondWithExam(
  db: Client,
  env: ServerEnv,
  request: Request,
  participantId: string,
  attempt: Awaited<ReturnType<typeof getAttemptById>>,
  resumed: boolean,
  settings: Awaited<ReturnType<typeof getSettings>>,
  token: string,
): Promise<Response> {
  if (!attempt) throw new ApiError(500, "internal", "Could not load the attempt.");

  const order = parseQuestionOrder(attempt.question_order);
  const questions: StartQuestion[] = [];
  for (const entry of order) {
    const q = await db.execute({
      sql: "SELECT id, text, option_a, option_b, option_c, option_d FROM questions WHERE id = ? AND is_active = 1",
      args: [entry.qid],
    });
    const row = q.rows[0];
    if (!row) continue;
    const all = {
      A: String(row.option_a),
      B: String(row.option_b),
      C: String(row.option_c),
      D: String(row.option_d),
    };
    questions.push({
      id: String(row.id),
      text: String(row.text),
      options: entry.options.map((key) => ({ key, text: all[key] })),
    });
  }

  const answered: Record<string, string | null> = {};
  const answerRows = await db.execute({
    sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
    args: [attempt.id],
  });
  for (const row of answerRows.rows) {
    answered[String(row.question_id)] = row.selected_option == null ? null : String(row.selected_option);
  }

  const now = nowSec();
  return json(
    {
      serverTime: Date.now(),
      endsAt: attempt.ends_at,
      remainingSeconds: Math.max(0, attempt.ends_at - now),
      resume: resumed,
      maxViolations: settings.maxViolations,
      snapshotIntervalSeconds: settings.snapshotIntervalSeconds,
      questions,
      answered,
      violations: attempt.violation_count,
    },
    { headers: { "set-cookie": participantSetCookie(request, env, token) } },
  );
}
