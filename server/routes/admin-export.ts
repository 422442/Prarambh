/**
 * GET /api/admin/export — CSV export of results (same columns as the
 * participants list, global rank). Runs lazy finalization first.
 */
import type { Client } from "@libsql/client";
import { ApiError, type ServerEnv } from "../http";
import { requireAdmin } from "../auth";
import { finalizeExpiredAttempts } from "../attempt";
import { fetchAllResultRows } from "./admin-participants";

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function handleAdminExport(request: Request, db: Client, env: ServerEnv): Promise<Response> {
  await requireAdmin(request, env);
  await finalizeExpiredAttempts(db);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const flagged = url.searchParams.get("flagged") === "1";
  const rows = await fetchAllResultRows(db, { q, flaggedOnly: flagged });

  const header = [
    "rank",
    "name",
    "email",
    "status",
    "score",
    "correct",
    "wrong",
    "unanswered",
    "time_taken",
    "violations",
    "submitted_at",
    "submit_reason",
  ].join(",");

  const lines = rows.map((r) =>
    [
      r.rank ?? "",
      csvEscape(r.name),
      r.email,
      r.status,
      r.score ?? "",
      r.correct ?? "",
      r.wrong ?? "",
      r.unanswered ?? "",
      formatDuration(r.timeTakenSeconds),
      r.violations,
      r.submittedAt ? new Date(r.submittedAt * 1000).toISOString() : "",
      r.submitReason ?? "",
    ].join(","),
  );

  const body = [header, ...lines].join("\r\n");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="tech-quiz-results.csv"',
      "cache-control": "no-store",
    },
  });
}

export { ApiError };
