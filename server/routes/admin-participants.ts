/**
 * GET /api/admin/participants — paginated, searchable, sortable list with
 * computed rank (score desc, time_taken asc). Runs lazy finalization first.
 */
import type { Client } from "@libsql/client";
import { json, ApiError, type ServerEnv } from "../http";
import { requireAdmin } from "../auth";
import { finalizeExpiredAttempts } from "../attempt";

export type ParticipantRow = {
  participantId: string;
  name: string;
  email: string;
  status: "registered" | "in_progress" | "submitted";
  score: number | null;
  correct: number | null;
  wrong: number | null;
  unanswered: number | null;
  timeTakenSeconds: number | null;
  violations: number;
  submittedAt: number | null;
  submitReason: string | null;
  rank: number | null;
};

const SORTABLE = {
  score: "a.score",
  time: "a.time_taken_seconds",
  name: "p.name",
  email: "p.email",
  submitted_at: "a.submitted_at",
} as const;

export async function handleAdminParticipants(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  await requireAdmin(request, env);
  await finalizeExpiredAttempts(db);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(url.searchParams.get("pageSize") ?? "20") || 20),
  );
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "all";
  const flagged = url.searchParams.get("flagged") === "1";
  const sortKey = (url.searchParams.get("sort") ?? "rank") as keyof typeof SORTABLE | "rank";
  const dir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";

  const where: string[] = [];
  const args: Array<string | number> = [];
  if (q) {
    where.push("(LOWER(p.name) LIKE ? OR p.email LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (status === "submitted") where.push("a.status = 'submitted'");
  if (status === "in_progress") where.push("a.status = 'in_progress'");
  if (status === "registered") where.push("a.id IS NULL");
  if (flagged) where.push("a.violation_count > 0");
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRows = await db.execute({
    sql: `SELECT COUNT(*) AS n
          FROM participants p
          LEFT JOIN attempts a ON a.participant_id = p.id
          ${whereSql}`,
    args,
  });
  const total = Number(totalRows.rows[0]?.n ?? 0);

  // Rank ordering is fixed: score DESC, time_taken ASC (doc §4 tie-breaker).
  const orderBy =
    sortKey === "rank" || !SORTABLE[sortKey as keyof typeof SORTABLE]
      ? "ORDER BY CASE WHEN a.status = 'submitted' THEN 0 ELSE 1 END, a.score DESC, a.time_taken_seconds ASC, p.created_at ASC"
      : `ORDER BY ${SORTABLE[sortKey as keyof typeof SORTABLE]} ${dir} NULLS LAST`;

  const list = await db.execute({
    sql: `SELECT p.id AS pid, p.name, p.email,
                 a.id AS aid, a.status, a.score, a.correct_count, a.wrong_count,
                 a.unanswered_count, a.time_taken_seconds, a.violation_count,
                 a.submitted_at, a.submit_reason
          FROM participants p
          LEFT JOIN attempts a ON a.participant_id = p.id
          ${whereSql}
          ${orderBy}
          LIMIT ? OFFSET ?`,
    args: [...args, pageSize, (page - 1) * pageSize],
  });

  // Global ranks for submitted attempts (score desc, time asc).
  const rankRows = await db.execute({
    sql: `SELECT participant_id FROM attempts WHERE status = 'submitted'
          ORDER BY score DESC, time_taken_seconds ASC`,
    args: [],
  });
  const rankByParticipant = new Map<string, number>();
  rankRows.rows.forEach((row, i) => rankByParticipant.set(String(row.participant_id), i + 1));

  const rows: ParticipantRow[] = list.rows.map((row) => {
    const pid = String(row.pid);
    const attemptId = row.aid == null ? null : String(row.aid);
    const status =
      attemptId == null ? "registered" : row.status === "submitted" ? "submitted" : "in_progress";
    return {
      participantId: pid,
      name: String(row.name),
      email: String(row.email),
      status,
      score: row.score == null ? null : Number(row.score),
      correct: row.correct_count == null ? null : Number(row.correct_count),
      wrong: row.wrong_count == null ? null : Number(row.wrong_count),
      unanswered: row.unanswered_count == null ? null : Number(row.unanswered_count),
      timeTakenSeconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
      violations: Number(row.violation_count ?? 0),
      submittedAt: row.submitted_at == null ? null : Number(row.submitted_at),
      submitReason: row.submit_reason == null ? null : String(row.submit_reason),
      rank: rankByParticipant.get(pid) ?? null,
    };
  });

  return json({ rows, total, page, pageSize });
}

export function participantsNotFound(): ApiError {
  return new ApiError(404, "not_found", "Participant not found.");
}

/**
 * All result rows with global rank (score desc, time_taken asc), no
 * pagination — used by the CSV export. Same lazy finalization contract.
 */
export async function fetchAllResultRows(
  db: Client,
  filters: { q?: string; flaggedOnly?: boolean; status?: string },
): Promise<ParticipantRow[]> {
  const where: string[] = [];
  const args: Array<string | number> = [];
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    where.push("(LOWER(p.name) LIKE ? OR p.email LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (filters.flaggedOnly) where.push("a.violation_count > 0");
  if (filters.status === "submitted") where.push("a.status = 'submitted'");
  if (filters.status === "in_progress") where.push("a.status = 'in_progress'");
  if (filters.status === "registered") where.push("a.id IS NULL");
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const list = await db.execute({
    sql: `SELECT p.id AS pid, p.name, p.email,
                 a.id AS aid, a.status, a.score, a.correct_count, a.wrong_count,
                 a.unanswered_count, a.time_taken_seconds, a.violation_count,
                 a.submitted_at, a.submit_reason
          FROM participants p
          LEFT JOIN attempts a ON a.participant_id = p.id
          ${whereSql}
          ORDER BY CASE WHEN a.status = 'submitted' THEN 0 ELSE 1 END,
                   a.score DESC, a.time_taken_seconds ASC, p.created_at ASC`,
    args,
  });

  const rankRows = await db.execute({
    sql: `SELECT participant_id FROM attempts WHERE status = 'submitted'
          ORDER BY score DESC, time_taken_seconds ASC`,
    args: [],
  });
  const rankByParticipant = new Map<string, number>();
  rankRows.rows.forEach((row, i) => rankByParticipant.set(String(row.participant_id), i + 1));

  return list.rows.map((row) => {
    const pid = String(row.pid);
    const attemptId = row.aid == null ? null : String(row.aid);
    const status =
      attemptId == null ? "registered" : row.status === "submitted" ? "submitted" : "in_progress";
    return {
      participantId: pid,
      name: String(row.name),
      email: String(row.email),
      status,
      score: row.score == null ? null : Number(row.score),
      correct: row.correct_count == null ? null : Number(row.correct_count),
      wrong: row.wrong_count == null ? null : Number(row.wrong_count),
      unanswered: row.unanswered_count == null ? null : Number(row.unanswered_count),
      timeTakenSeconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
      violations: Number(row.violation_count ?? 0),
      submittedAt: row.submitted_at == null ? null : Number(row.submitted_at),
      submitReason: row.submit_reason == null ? null : String(row.submit_reason),
      rank: rankByParticipant.get(pid) ?? null,
    };
  });
}
