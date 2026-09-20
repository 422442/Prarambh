/**
 * Builds the runtime context (env + db client) for route wrappers.
 * Tests inject their own context instead of using this.
 */
import { getEnv } from "./env";
import { getDb } from "./db";
import type { ServerEnv } from "./http";
import type { Client } from "@libsql/client";

export function makeContext(): { env: ServerEnv; db: Client } {
  const env = getEnv();
  return { env, db: getDb(env) };
}
