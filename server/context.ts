/**
 * Builds the runtime context (env + db client) for route wrappers.
 * Tests inject their own context instead of using this.
 *
 * The database module is imported lazily: if the driver ever fails to load in
 * the deployed function, the adapter turns it into a JSON 500 with a runtime
 * log instead of crashing the function at cold start (Vercel's
 * FUNCTION_INVOCATION_FAILED), and routes that do not touch the database
 * (e.g. /api/time, /api/health) keep working.
 */
import { getEnv } from "./env";
import type { ServerEnv } from "./http";
import type { Client } from "@libsql/client";

export type RequestContext = { env: ServerEnv; db: Client };

export async function makeContext(): Promise<RequestContext> {
  const env = getEnv();
  const { getDb } = await import("./db");
  return { env, db: getDb(env) };
}
