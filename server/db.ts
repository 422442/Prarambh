/**
 * Turso (libSQL) database client + settings accessor.
 * A client is cached per URL so serverless invocations reuse the connection.
 */
import { createClient, type Client } from "@libsql/client";
import type { ServerEnv } from "./http";

let cached: { url: string; authToken?: string; client: Client } | null = null;

export function getDb(env?: Partial<ServerEnv>): Client {
  const url = env?.databaseUrl ?? process.env.TURSO_DATABASE_URL ?? "";
  const authToken = env?.databaseAuthToken ?? process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  if (cached && cached.url === url && cached.authToken === authToken) return cached.client;
  if (cached) cached.client.close();
  const client = url.startsWith("file:")
    ? createClient({ url })
    : createClient({ url, ...(authToken ? { authToken } : {}) });
  cached = { url, ...(authToken ? { authToken } : {}), client };
  return client;
}

/** Settings row keys and their defaults (seeded by scripts/db-seed.ts). */
export const SETTINGS_DEFAULTS = {
  exam_open: "1",
  duration_minutes: "45",
  question_count: "60",
  marks_correct: "2",
  marks_wrong: "-0.5",
  max_violations: "3",
  clamp_score_at_zero: "0",
  snapshot_interval_seconds: "45",
  snapshot_retention_days: "30",
} as const;

export type Settings = {
  examOpen: boolean;
  durationMinutes: number;
  questionCount: number;
  marksCorrect: number;
  marksWrong: number;
  maxViolations: number;
  clampScoreAtZero: boolean;
  snapshotIntervalSeconds: number;
  snapshotRetentionDays: number;
};

export function parseSettings(rows: { key: string; value: string }[]): Settings {
  const map = new Map(rows.map((r) => [r.key, r.value] as const));
  const num = (key: keyof typeof SETTINGS_DEFAULTS) =>
    Number(map.get(key) ?? SETTINGS_DEFAULTS[key]);
  return {
    examOpen: (map.get("exam_open") ?? "1") === "1",
    durationMinutes: num("duration_minutes"),
    questionCount: num("question_count"),
    marksCorrect: num("marks_correct"),
    marksWrong: num("marks_wrong"),
    maxViolations: num("max_violations"),
    clampScoreAtZero: (map.get("clamp_score_at_zero") ?? "0") === "1",
    snapshotIntervalSeconds: num("snapshot_interval_seconds"),
    snapshotRetentionDays: num("snapshot_retention_days"),
  };
}

export async function getSettings(db: Client): Promise<Settings> {
  const result = await db.execute("SELECT key, value FROM settings");
  return parseSettings(result.rows.map((r) => ({ key: String(r.key), value: String(r.value) })));
}

/** Current unix seconds / milliseconds helpers. */
export const nowSec = () => Math.floor(Date.now() / 1000);
