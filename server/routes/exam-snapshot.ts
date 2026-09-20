/**
 * POST /api/exam/snapshot — receives a downscaled JPEG (base64 data URL),
 * uploads it to Vercel Blob server-side, stores a snapshots row.
 */
import { z } from "zod";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { getAttemptByParticipant, ensureNotExpired } from "../attempt";
import { getSettings } from "../db";
import { requireParticipantClaims, ensureAttemptSession } from "../auth";

const MAX_IMAGE_BYTES = 256 * 1024;

const schema = z.object({
  image: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "image must be a base64 JPEG data URL"),
  faceCount: z.number().int().min(0).max(16).nullable().default(null),
  kind: z.enum(["periodic", "violation"]),
});

export async function handleExamSnapshot(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  const body = await readJson(request, schema);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const attempt = await ensureNotExpired(db, attemptRow, undefined, settings);
  if (attempt.status !== "in_progress") {
    throw new ApiError(409, "already_submitted", "This attempt has already been submitted.");
  }

  const base64 = body.image.slice(body.image.indexOf(",") + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "image_too_large", "Snapshot must be under 256 KB.");
  }

  if (!env.blobToken) {
    // Snapshots are best-effort evidence: accept but don't store if Blob is
    // not configured, so exams aren't disrupted in misconfigured environments.
    console.warn("[snapshot] BLOB_READ_WRITE_TOKEN not set — snapshot skipped");
    return json({ ok: true, stored: false });
  }

  const { put } = await import("@vercel/blob");
  const blob = await put(`snapshots/${attempt.id}/${Date.now()}-${body.kind}.jpg`, base64, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/jpeg",
    token: env.blobToken,
  });

  await db.execute({
    sql: "INSERT INTO snapshots (id, attempt_id, blob_url, kind, face_count, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), attempt.id, blob.url, body.kind, body.faceCount, Math.floor(Date.now() / 1000)],
  });

  return json({ ok: true, stored: true });
}
