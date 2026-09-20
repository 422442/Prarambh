/**
 * POST /api/exam/submit — idempotent finalization + scoring.
 * Body {reason:"manual"} from the client; server overrides the reason for
 * time_up/violations paths. No score is ever returned to the participant.
 */
import { z } from "zod";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { getSettings, nowSec } from "../db";
import {
  getAttemptByParticipant,
  ensureNotExpired,
  finalizeAttempt,
  GRACE_SECONDS,
} from "../attempt";
import { requireParticipantClaims, ensureAttemptSession } from "../auth";

const schema = z.object({
  reason: z.enum(["manual"]).default("manual"),
});

export async function handleExamSubmit(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  const body = await readJson(request, schema);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");

  const settings = await getSettings(db);
  const now = nowSec();
  const attempt = await ensureNotExpired(db, attemptRow, now, settings);

  if (attempt.status === "submitted") {
    // Idempotent: double submit returns the same result.
    return json({ status: "submitted", submitReason: attempt.submit_reason });
  }

  let reason: "manual" | "time_up" = body.reason;
  if (now > attempt.ends_at + GRACE_SECONDS) {
    // Past deadline: finalize from saved answers with time_up semantics.
    reason = "time_up";
    const finalized = await finalizeAttempt(db, attempt.id, reason, Math.max(now, attempt.ends_at), settings);
    return json({ status: "submitted", submitReason: finalized.submit_reason });
  }

  const finalized = await finalizeAttempt(db, attempt.id, reason, now, settings);
  return json({ status: "submitted", submitReason: finalized.submit_reason });
}
