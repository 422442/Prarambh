/**
 * GET /api/cron/finalize — cron sweeper. Finalizes every expired in-progress
 * attempt from saved answers. Protected by CRON_SECRET (Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when the env var is set;
 * `?secret=` also works for manual runs).
 */
import type { Client } from "@libsql/client";
import { json, ApiError, type ServerEnv } from "../http";
import { finalizeExpiredAttempts } from "../attempt";

export function assertCronSecret(request: Request, env: ServerEnv): void {
  const expected = env.cronSecret;
  if (!expected) throw new ApiError(500, "misconfigured", "CRON_SECRET is not set.");
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (bearer !== expected && querySecret !== expected) {
    throw new ApiError(401, "unauthorized", "Cron authentication required.");
  }
}

export async function handleCronFinalize(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  assertCronSecret(request, env);
  const finalized = await finalizeExpiredAttempts(db);
  return json({ ok: true, finalized });
}

