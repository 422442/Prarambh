/**
 * POST /api/auth/register — name + email login.
 * Creates or finds the participant, rotates the session, never errors on a
 * duplicate email (returns resuming / submitted instead).
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { getSettings, nowSec } from "../db";
import { getAttemptByParticipant, ensureNotExpired } from "../attempt";
import { signToken, participantSetCookie, PARTICIPANT_MAX_AGE } from "../auth";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
});

export type RegisterResult = {
  status: "new" | "resuming" | "submitted";
  name: string;
  email: string;
  termsAccepted: boolean;
  cameraConsent: boolean;
  examOpen: boolean;
  serverTime: number;
};

export async function handleRegister(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  const body = await readJson(request, schema);
  const now = nowSec();
  const settings = await getSettings(db);

  const existing = await db.execute({
    sql: "SELECT id, name, email, terms_accepted_at, camera_consent_at FROM participants WHERE email = ?",
    args: [body.email],
  });
  let participantId: string;
  let name: string;
  let termsAccepted = false;
  let cameraConsent = false;
  let status: RegisterResult["status"] = "new";

  if (existing.rows.length === 0) {
    if (!settings.examOpen) {
      throw new ApiError(403, "exam_closed", "The exam is not open right now.");
    }
    participantId = nanoid();
    name = body.name;
    await db.execute({
      sql: "INSERT INTO participants (id, name, email, last_login_name, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [participantId, body.name, body.email, body.name, now],
    });
  } else {
    const row = existing.rows[0]!;
    participantId = String(row.id);
    name = String(row.name);
    termsAccepted = row.terms_accepted_at != null;
    cameraConsent = row.camera_consent_at != null;

    // Name-mismatch note for the admin (original name is kept).
    if (body.name !== name) {
      await db.execute({
        sql: "UPDATE participants SET last_login_name = ? WHERE id = ?",
        args: [body.name, participantId],
      });
    }

    const attempt = await getAttemptByParticipant(db, participantId);
    if (attempt) {
      const fresh = await ensureNotExpired(db, attempt, now, settings);
      status = fresh.status === "submitted" ? "submitted" : "resuming";
    }
  }

  // Fresh session for this login. The attempt's stored session_id is rotated
  // by /api/exam/start, so an open exam tab stays valid until a new start.
  const sid = nanoid();
  const token = await signToken(env.sessionSecret, { sub: participantId, sid }, PARTICIPANT_MAX_AGE);

  return json(
    {
      status,
      name,
      email: body.email,
      termsAccepted,
      cameraConsent,
      examOpen: settings.examOpen,
      serverTime: Date.now(),
    },
    { headers: { "set-cookie": participantSetCookie(request, env, token) } },
  );
}
