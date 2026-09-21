/**
 * GET /api/health — deployment diagnostics for the /api functions.
 *
 * Deliberately free of third-party imports: if this route answers with JSON,
 * then the Node runtime, the bundler and the /api routing are healthy, and any
 * remaining 5xx must come from a dependency (reported in `checks`).
 *
 * `ok: true` → 200, any failed check → 503 with the reason in the JSON body.
 */
import { adapter } from "../server/vercel";

type Check = { ok: boolean; detail: string };

function envFlag(name: string): string {
  return process.env[name] ? "set" : "MISSING";
}

async function checkDatabase(): Promise<Check> {
  try {
    // Imported lazily so a driver failure is reported here instead of crashing
    // the function at cold start.
    const { getDb } = await import("../server/db");
    const db = getDb();
    const result = await db.execute("SELECT COUNT(*) AS questions FROM questions");
    return {
      ok: true,
      detail: `driver loaded, questions=${String(result.rows[0]?.questions ?? "?")}`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export default adapter(async () => {
  const checks: Record<string, Check> = {
    runtime: { ok: true, detail: `node ${process.version}` },
    env: {
      ok: Boolean(
        process.env.TURSO_DATABASE_URL &&
        process.env.TURSO_AUTH_TOKEN &&
        process.env.SESSION_SECRET,
      ),
      detail: `TURSO_DATABASE_URL=${envFlag("TURSO_DATABASE_URL")} TURSO_AUTH_TOKEN=${envFlag(
        "TURSO_AUTH_TOKEN",
      )} SESSION_SECRET=${envFlag("SESSION_SECRET")} CRON_SECRET=${envFlag("CRON_SECRET")}`,
    },
    database: await checkDatabase(),
  };
  const ok = Object.values(checks).every((check) => check.ok);
  return new Response(JSON.stringify({ ok, checks }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
