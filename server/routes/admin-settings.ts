/**
 * PUT /api/admin/settings — update exam_open, snapshot_retention_days,
 * clamp_score_at_zero.
 */
import { z } from "zod";
import type { Client } from "@libsql/client";
import { json, readJson, type ServerEnv } from "../http";
import { getSettings } from "../db";
import { requireAdmin } from "../auth";

const schema = z.object({
  examOpen: z.boolean().optional(),
  snapshotRetentionDays: z.number().int().min(1).max(365).optional(),
  clampScoreAtZero: z.boolean().optional(),
});

export async function handleAdminSettingsUpdate(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  await requireAdmin(request, env);
  const body = await readJson(request, schema);

  const updates: Array<[string, string]> = [];
  if (body.examOpen !== undefined) updates.push(["exam_open", body.examOpen ? "1" : "0"]);
  if (body.snapshotRetentionDays !== undefined)
    updates.push(["snapshot_retention_days", String(body.snapshotRetentionDays)]);
  if (body.clampScoreAtZero !== undefined) updates.push(["clamp_score_at_zero", body.clampScoreAtZero ? "1" : "0"]);

  for (const [key, value] of updates) {
    await db.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key, value],
    });
  }

  const settings = await getSettings(db);
  return json({
    settings: {
      examOpen: settings.examOpen,
      snapshotRetentionDays: settings.snapshotRetentionDays,
      clampScoreAtZero: settings.clampScoreAtZero,
      durationMinutes: settings.durationMinutes,
      questionCount: settings.questionCount,
      marksCorrect: settings.marksCorrect,
      marksWrong: settings.marksWrong,
      maxViolations: settings.maxViolations,
    },
  });
}
