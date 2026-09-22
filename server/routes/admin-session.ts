/**
 * POST /api/admin/logout — clears the admin cookie.
 * GET  /api/admin/session — used by the admin shell to verify the session.
 */
import type { Client } from "@libsql/client";
import { json, type ServerEnv } from "../http";
import { requireAdmin, clearCookie, ADMIN_COOKIE, isSecureRequest } from "../auth";

export async function handleAdminLogout(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  void db;
  return json(
    { ok: true },
    { headers: { "set-cookie": clearCookie(ADMIN_COOKIE, isSecureRequest(request)) } },
  );
}

export async function handleAdminSession(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const rows = await db.execute({
    sql: "SELECT email FROM admins WHERE id = ?",
    args: [admin.sub],
  });
  const email = rows.rows[0] ? String(rows.rows[0].email) : null;
  return json({ authenticated: true, email });
}
