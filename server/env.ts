/**
 * Environment accessor for /api handlers.
 * Every handler receives `env` so tests can inject values instead of
 * mutating process.env.
 */
import type { ServerEnv } from "./http";

export function getEnv(overrides?: Partial<ServerEnv>): ServerEnv {
  const env: ServerEnv = {
    sessionSecret: overrides?.sessionSecret ?? process.env.SESSION_SECRET ?? "",
  };
  const cron = overrides?.cronSecret ?? process.env.CRON_SECRET;
  if (cron !== undefined) env.cronSecret = cron;
  const blob = overrides?.blobToken ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (blob !== undefined) env.blobToken = blob;
  const dbUrl = overrides?.databaseUrl ?? process.env.TURSO_DATABASE_URL;
  if (dbUrl !== undefined) env.databaseUrl = dbUrl;
  const dbAuth = overrides?.databaseAuthToken ?? process.env.TURSO_AUTH_TOKEN;
  if (dbAuth !== undefined) env.databaseAuthToken = dbAuth;
  return env;
}
