/**
 * PUT / DELETE /api/admin/questions/:id — edit or delete a question.
 * Blocked while any attempt is in_progress.
 */
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { nowSec } from "../db";
import { requireAdmin } from "../auth";
import { hasAttemptInProgress } from "../attempt";
import { questionSchema } from "./admin-questions";

export async function handleAdminQuestionUpdate(
  request: Request,
  db: Client,
  env: ServerEnv,
  questionId: string,
): Promise<Response> {
  await requireAdmin(request, env);
  if (await hasAttemptInProgress(db)) {
    throw new ApiError(409, "exam_in_progress", "Questions cannot be changed while an exam is in progress.");
  }
  const body = await readJson(request, questionSchema.partial());
  const existing = await db.execute({ sql: "SELECT id FROM questions WHERE id = ?", args: [questionId] });
  if (existing.rows.length === 0) throw new ApiError(404, "not_found", "Question not found.");

  const sets: string[] = [];
  const args: Array<string | number> = [];
  if (body.text !== undefined) (sets.push("text = ?"), args.push(body.text));
  if (body.optionA !== undefined) (sets.push("option_a = ?"), args.push(body.optionA));
  if (body.optionB !== undefined) (sets.push("option_b = ?"), args.push(body.optionB));
  if (body.optionC !== undefined) (sets.push("option_c = ?"), args.push(body.optionC));
  if (body.optionD !== undefined) (sets.push("option_d = ?"), args.push(body.optionD));
  if (body.correctOption !== undefined) (sets.push("correct_option = ?"), args.push(body.correctOption));
  if (body.isActive !== undefined) (sets.push("is_active = ?"), args.push(body.isActive ? 1 : 0));
  if (sets.length === 0) return json({ ok: true });

  sets.push("updated_at = ?");
  args.push(nowSec());
  args.push(questionId);
  await db.execute({ sql: `UPDATE questions SET ${sets.join(", ")} WHERE id = ?`, args });
  return json({ ok: true });
}

export async function handleAdminQuestionDelete(
  request: Request,
  db: Client,
  env: ServerEnv,
  questionId: string,
): Promise<Response> {
  await requireAdmin(request, env);
  if (await hasAttemptInProgress(db)) {
    throw new ApiError(409, "exam_in_progress", "Questions cannot be changed while an exam is in progress.");
  }
  const result = await db.execute({ sql: "DELETE FROM questions WHERE id = ?", args: [questionId] });
  if (result.rowsAffected === 0) throw new ApiError(404, "not_found", "Question not found.");
  return json({ ok: true });
}
