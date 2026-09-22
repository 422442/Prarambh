/**
 * POST /api/admin/login — bcrypt password check, Turso-backed rate limiting
 * (5 failures per 15 min per IP+email), generic error messages.
 */
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { nowSec } from "../db";
import { signToken, adminSetCookie, ADMIN_MAX_AGE } from "../auth";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const RATE_LIMIT_WINDOW_SEC = 15 * 60;
const RATE_LIMIT_MAX_FAILURES = 5;

export const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

export async function handleAdminLogin(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  const body = await readJson(request, schema);
  const ip = ipOf(request);
  const bucketKey = createHash("sha256")
    .update(`${ip}|${body.email}|admin_login`)
    .digest("hex")
    .slice(0, 40);
  const now = nowSec();

  let row: Record<string, unknown> | undefined;
  try {
    const limit = await db.execute({
      sql: "SELECT window_start, fail_count FROM rate_limits WHERE id = ? AND bucket = 'admin_login'",
      args: [bucketKey],
    });
    row = limit.rows[0] as Record<string, unknown> | undefined;
    if (row) {
      const windowStart = Number(row.window_start);
      const expired = now - windowStart >= RATE_LIMIT_WINDOW_SEC;
      if (!expired && Number(row.fail_count) >= RATE_LIMIT_MAX_FAILURES) {
        throw new ApiError(429, "rate_limited", GENERIC_LOGIN_ERROR);
      }
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // rate_limits table may not exist yet if database is not fully migrated — continue safely
  }

  let admin: Record<string, unknown> | undefined;
  try {
    const admins = await db.execute({
      sql: "SELECT id, email, password_hash FROM admins WHERE email = ?",
      args: [body.email],
    });
    admin = admins.rows[0] as Record<string, unknown> | undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      throw new ApiError(
        500,
        "db_not_migrated",
        "Database is not migrated yet. Please run 'pnpm db:migrate' and 'pnpm db:seed'.",
      );
    }
    throw err;
  }

  const ok = admin ? await bcrypt.compare(body.password, String(admin.password_hash)) : false;

  if (!ok || !admin) {
    try {
      if (row && now - Number(row.window_start) < RATE_LIMIT_WINDOW_SEC) {
        await db.execute({
          sql: "UPDATE rate_limits SET fail_count = fail_count + 1 WHERE id = ?",
          args: [bucketKey],
        });
      } else {
        await db.execute({
          sql: `INSERT INTO rate_limits (id, bucket, window_start, fail_count) VALUES (?, 'admin_login', ?, 1)
                ON CONFLICT(id) DO UPDATE SET window_start = excluded.window_start, fail_count = excluded.fail_count`,
          args: [bucketKey, now],
        });
      }
    } catch {
      // Ignore rate limit write failure if table does not exist
    }
    throw new ApiError(401, "unauthorized", GENERIC_LOGIN_ERROR);
  }

  // Success clears the counter.
  try {
    await db.execute({ sql: "DELETE FROM rate_limits WHERE id = ?", args: [bucketKey] });
  } catch {
    // Ignore rate limit deletion error
  }

  try {
    await db.execute({
      sql: "INSERT INTO admin_audit (id, admin_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [randomUUID(), String(admin.id), "login", body.email, null, now],
    });
  } catch {
    // Audit log failure should not block successful admin authentication
  }

  const token = await signToken(
    env.sessionSecret,
    { sub: String(admin.id), role: "admin" },
    ADMIN_MAX_AGE,
  );
  return json(
    { ok: true, email: String(admin.email) },
    { headers: { "set-cookie": adminSetCookie(request, env, token) } },
  );
}

function ipOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}
