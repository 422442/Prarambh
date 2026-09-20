/** POST /api/terms/accept — records terms version + camera consent timestamps. */
import { z } from "zod";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { nowSec } from "../db";
import { requireParticipantClaims } from "../auth";

const schema = z.object({
  termsVersion: z.string().min(1).max(32),
});

export async function handleTermsAccept(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  const claims = await requireParticipantClaims(request, env);
  const body = await readJson(request, schema);
  const now = nowSec();
  const result = await db.execute({
    sql: `UPDATE participants
          SET terms_version = ?, terms_accepted_at = ?, camera_consent_at = COALESCE(camera_consent_at, ?)
          WHERE id = ?`,
    args: [body.termsVersion, now, now, claims.sub],
  });
  if (result.rowsAffected === 0) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  return json({ ok: true });
}
