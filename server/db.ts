/**
 * Turso (libSQL) database client + settings accessor.
 * A client is cached per URL so serverless invocations reuse the connection.
 *
 * The API deliberately uses the *fetch* entrypoint of `@libsql/client`
 * (`@libsql/client/web`). The default Node entrypoint statically imports the
 * `libsql` native addon, which resolves its platform binary through a dynamic
 * `require(`@libsql/${target}`)`. Serverless bundlers (Vercel) cannot trace
 * such a dynamic require, so the binary is missing inside the deployed
 * function and every `/api/*` route dies at module load with
 * `FUNCTION_INVOCATION_FAILED` — before any handler code runs, which is why
 * the adapter's try/catch never produced a JSON error.
 *
 * The fetch client needs no native code, opens no sockets (HTTP protocol
 * instead of WebSockets — what Turso recommends for serverless) and accepts
 * `libsql://` URLs directly.
 *
 * The `.ts` scripts under scripts/ keep the Node entrypoint because they also
 * support local `file:` databases.
 */
import { createClient, type Client } from "@libsql/client/web";
import type { ServerEnv } from "./http";

let cached: { url: string; authToken?: string; client: Client } | null = null;

/** `libsql://host` / `turso://host` → `https://host`; the web client only speaks HTTP(S)/WS(S). */
export function toHttpUrl(url: string): string {
  if (url.startsWith("libsql://")) return `https://${url.slice("libsql://".length)}`;
  if (url.startsWith("turso://")) return `https://${url.slice("turso://".length)}`;
  return url;
}

export function getDb(env?: Partial<ServerEnv>): Client {
  const rawUrl = (env?.databaseUrl ?? process.env.TURSO_DATABASE_URL ?? "").trim();
  const authToken = (env?.databaseAuthToken ?? process.env.TURSO_AUTH_TOKEN)?.trim();
  if (!rawUrl) throw new Error("TURSO_DATABASE_URL is not set");
  if (rawUrl.startsWith("file:")) {
    throw new Error(
      "TURSO_DATABASE_URL must be a remote libsql:// (or https://) Turso URL for the serverless API; local file: databases are only supported by the scripts.",
    );
  }
  const url = toHttpUrl(rawUrl);
  if (cached && cached.url === url && cached.authToken === authToken) return cached.client;
  if (cached) cached.client.close();
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
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
