import type { Client } from "@libsql/client";
import { json, type ServerEnv } from "../http";
import { requireAdmin } from "../auth";

export async function handleAdminResetAll(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  await requireAdmin(request, env);

  await db.execute("DELETE FROM snapshots");
  await db.execute("DELETE FROM violations");
  await db.execute("DELETE FROM answers");
  await db.execute("DELETE FROM attempts");
  await db.execute("DELETE FROM participants");

  return json({ ok: true, message: "All exam attempts and participants reset successfully." });
}
