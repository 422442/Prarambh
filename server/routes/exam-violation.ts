/**
 * POST /api/exam/violation — server-counted violations with debounce.
 * On the 3rd violation the attempt is auto-submitted (reason "violations").
 * Returns { count, autoSubmitted }.
 */
import { z } from "zod";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { getSettings, nowSec } from "../db";
import {
  getAttemptByParticipant,
  ensureNotExpired,
  finalizeAttempt,
  mapAttempt,
  type AttemptRow,
} from "../attempt";
import { requireParticipantClaims, ensureAttemptSession } from "../auth";
import {
  shouldCountViolation,
  VIOLATION_TYPES,
  isAutoSubmit,
  type ViolationType,
} from "../violations";

const schema = z.object({
  type: z.enum(VIOLATION_TYPES),
  meta: z.record(z.unknown()).optional(),
});

export async function handleExamViolation(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  const body = await readJson(request, schema);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");

  const settings = await getSettings(db);
  const attempt = await ensureNotExpired(db, attemptRow, undefined, settings);
  if (attempt.status !== "in_progress") {
    return json({ count: attempt.violation_count, autoSubmitted: false });
  }

  const nowMs = Date.now();
  const count = await recordViolation(db, attempt, body.type, nowMs, body.meta, settings);

  if (isAutoSubmit(count, settings.maxViolations)) {
    await finalizeAttempt(db, attempt.id, "violations", nowSec(), settings);
    return json({ count, autoSubmitted: true });
  }
  return json({ count, autoSubmitted: false });
}

/**
 * Debounced violation recording. Returns the updated violation_count.
 * Same-type debounce uses the most recent violation of the same type;
 * the burst window uses the most recent violation of any type.
 */
export async function recordViolation(
  db: Client,
  attempt: AttemptRow,
  type: ViolationType,
  nowMs: number,
  meta?: Record<string, unknown>,
  settingsOverride?: { maxViolations: number },
): Promise<number> {
  const prevAny = await db.execute({
    sql: "SELECT occurred_at FROM violations WHERE attempt_id = ? ORDER BY occurred_at DESC LIMIT 1",
    args: [attempt.id],
  });
  const prevSame = await db.execute({
    sql: "SELECT occurred_at FROM violations WHERE attempt_id = ? AND type = ? ORDER BY occurred_at DESC LIMIT 1",
    args: [attempt.id, type],
  });
  const lastAnyAtMs = prevAny.rows[0] ? Number(prevAny.rows[0].occurred_at) : null;
  const lastSameTypeAtMs = prevSame.rows[0] ? Number(prevSame.rows[0].occurred_at) : null;

  if (!shouldCountViolation({ lastAnyAtMs, lastSameTypeAtMs }, nowMs)) {
    return attempt.violation_count;
  }

  await db.execute({
    sql: "INSERT INTO violations (id, attempt_id, type, occurred_at, meta) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), attempt.id, type, nowMs, meta ? JSON.stringify(meta) : null],
  });
  await db.execute({
    sql: "UPDATE attempts SET violation_count = violation_count + 1 WHERE id = ?",
    args: [attempt.id],
  });

  const fresh = await db.execute({
    sql: "SELECT * FROM attempts WHERE id = ?",
    args: [attempt.id],
  });
  return fresh.rows[0]
    ? mapAttempt(fresh.rows[0] as unknown as Record<string, unknown>).violation_count
    : attempt.violation_count + 1;
}

export { mapAttempt };
