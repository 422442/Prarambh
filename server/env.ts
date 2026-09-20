/**
 * Environment accessor for /api handlers.
 * Every handler receives `env` so tests can inject values instead of
 * mutating process.env.
 */
import type { ServerEnv } from "./http";

export function getEnv(overrides?: Partial<ServerEnv>): ServerEnv {
  return {
    sessionSecret: overrides?.sessionSecret ?? process.env.SESSION_SECRET ?? "",
    cronSecret: overrides?.cronSecret ?? process.env.CRON_SECRET,
    blobToken: overrides?.blobToken ?? process.env.BLOB_READ_WRITE_TOKEN,
    databaseUrl: overrides?.databaseUrl ?? process.env.TURSO_DATABASE_URL,
    databaseAuthToken: overrides?.databaseAuthToken ?? process.env.TURSO_AUTH_TOKEN,
  };
}
