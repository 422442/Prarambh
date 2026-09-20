/**
 * GET  /api/admin/questions — list (paginated)
 * POST /api/admin/questions — create (blocked while any attempt is in_progress)
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { nowSec } from "../db";
import { requireAdmin } from "../auth";
import { hasAttemptInProgress } from "../attempt";

export const questionSchema = z.object({
  text: z.string().trim().min(3).max(2000),
  optionA: z.string().trim().min(1).max(500),
  optionB: z.string().trim().min(1).max(500),
  optionC: z.string().trim().min(1).max(500),
  optionD: z.string().trim().min(1).max(500),
  correctOption: z.enum(["A", "B", "C", "D"]),
  isActive: z.boolean().default(true),
});

export async function handleAdminQuestionsList(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") ?? "100") || 100));

  const total = await db.execute({ sql: "SELECT COUNT(*) AS n FROM questions", args: [] });
  const rows = await db.execute({
    sql: "SELECT id, text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at, updated_at FROM questions ORDER BY created_at ASC LIMIT ? OFFSET ?",
    args: [pageSize, (page - 1) * pageSize],
  });

  return json({
    total: Number(total.rows[0]?.n ?? 0),
    page,
    pageSize,
    rows: rows.rows.map((r) => ({
      id: String(r.id),
      text: String(r.text),
      optionA: String(r.option_a),
      optionB: String(r.option_b),
      optionC: String(r.option_c),
      optionD: String(r.option_d),
      correctOption: String(r.correct_option),
      isActive: Number(r.is_active) === 1,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    })),
  });
}

export async function handleAdminQuestionCreate(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  await requireAdmin(request, env);
  const body = await readJson(request, questionSchema);
  if (await hasAttemptInProgress(db)) {
    throw new ApiError(409, "exam_in_progress", "Questions cannot be changed while an exam is in progress.");
  }
  const id = randomUUID();
  const now = nowSec();
  await db.execute({
    sql: "INSERT INTO questions (id, text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, body.text, body.optionA, body.optionB, body.optionC, body.optionD, body.correctOption, body.isActive ? 1 : 0, now, now],
  });
  return json({ ok: true, id });
}
