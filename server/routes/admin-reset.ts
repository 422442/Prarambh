/**
 * POST /api/admin/participants/:id/reset — deletes the attempt (answers,
 * violations, snapshot rows and blobs) so the participant can retake.
 * Audit-logged.
 */
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { json, ApiError, type ServerEnv } from "../http";
import { nowSec } from "../db";
import { requireAdmin } from "../auth";
import { getAttemptByParticipant } from "../attempt";

export async function handleAdminReset(
  request: Request,
  db: Client,
  env: ServerEnv,
  participantId: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env);

  const pRows = await db.execute({
    sql: "SELECT id, email FROM participants WHERE id = ?",
    args: [participantId],
  });
  const p = pRows.rows[0];
  if (!p) throw new ApiError(404, "not_found", "Participant not found.");

  const attempt = await getAttemptByParticipant(db, participantId);
  let deletedSnapshots = 0;

  if (attempt) {
    const snapshotRows = await db.execute({
      sql: "SELECT id, blob_url FROM snapshots WHERE attempt_id = ?",
      args: [attempt.id],
    });

    // Best-effort blob deletion.
    if (env.blobToken && snapshotRows.rows.length > 0) {
      try {
        const { del } = await import("@vercel/blob");
        await del(
          snapshotRows.rows.map((r) => String(r.blob_url)),
          { token: env.blobToken },
        );
      } catch (err) {
        console.error("[admin-reset] blob deletion failed:", err);
      }
    }
    deletedSnapshots = snapshotRows.rows.length;

    await db.execute({ sql: "DELETE FROM snapshots WHERE attempt_id = ?", args: [attempt.id] });
    await db.execute({ sql: "DELETE FROM violations WHERE attempt_id = ?", args: [attempt.id] });
    await db.execute({ sql: "DELETE FROM answers WHERE attempt_id = ?", args: [attempt.id] });
    await db.execute({ sql: "DELETE FROM attempts WHERE id = ?", args: [attempt.id] });
  }

  await db.execute({
    sql: "INSERT INTO admin_audit (id, admin_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      randomUUID(),
      admin.sub,
      "reset_attempt",
      String(p.email),
      JSON.stringify({ attemptDeleted: !!attempt, snapshotsDeleted: deletedSnapshots }),
      nowSec(),
    ],
  });

  return json({ ok: true, attemptDeleted: !!attempt, snapshotsDeleted: deletedSnapshots });
}
