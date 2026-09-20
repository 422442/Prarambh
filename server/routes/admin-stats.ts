/** GET /api/admin/stats — dashboard numbers. */
import type { Client } from "@libsql/client";
import { json, type ServerEnv } from "../http";
import { getSettings } from "../db";
import { requireAdmin } from "../auth";
import { finalizeExpiredAttempts } from "../attempt";

export async function handleAdminStats(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  await requireAdmin(request, env);

  // Lazy finalization as part of admin reads.
  await finalizeExpiredAttempts(db);

  const settings = await getSettings(db);

  const registered = await db.execute({ sql: "SELECT COUNT(*) AS n FROM participants", args: [] });
  const attempts = await db.execute({
    sql: "SELECT status, score, time_taken_seconds, violation_count FROM attempts",
    args: [],
  });

  let inProgress = 0;
  let submitted = 0;
  let flagged = 0;
  let scoreSum = 0;
  let timeSum = 0;
  for (const row of attempts.rows) {
    const status = String(row.status);
    const violations = Number(row.violation_count ?? 0);
    if (violations > 0) flagged += 1;
    if (status === "submitted") {
      submitted += 1;
      scoreSum += Number(row.score ?? 0);
      timeSum += Number(row.time_taken_seconds ?? 0);
    } else {
      inProgress += 1;
    }
  }
  const registeredCount = Number(registered.rows[0]?.n ?? 0);

  const activeQuestions = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: [],
  });

  return json({
    registered: registeredCount,
    inProgress,
    submitted,
    flagged,
    avgScore: submitted > 0 ? Math.round((scoreSum / submitted) * 100) / 100 : null,
    avgTimeSeconds: submitted > 0 ? Math.round(timeSum / submitted) : null,
    activeQuestions: Number(activeQuestions.rows[0]?.n ?? 0),
    questionCount: settings.questionCount,
    examOpen: settings.examOpen,
    snapshotRetentionDays: settings.snapshotRetentionDays,
  });
}
