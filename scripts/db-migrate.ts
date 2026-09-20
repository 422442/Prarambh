/**
 * Applies SQL migrations from ./migrations in filename order.
 * Tracks applied files in the `_migrations` table.
 *
 * Usage:
 *   bun run db:migrate            # uses TURSO_DATABASE_URL / TURSO_AUTH_TOKEN (or file: for local)
 *   TURSO_DATABASE_URL=file:local.db bun run db:migrate
 */
import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env", override: false });

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is required (libsql://… or file:local.db)");
  process.exit(1);
}

const authToken = url.startsWith("file:") ? undefined : process.env["TURSO_AUTH_TOKEN"];
const db = url.startsWith("file:") ? createClient({ url }) : createClient({ url, authToken });

async function main() {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    (await db.execute("SELECT name FROM _migrations ORDER BY name")).rows.map((r) => String(r.name)),
  );

  const dir = join(import.meta.dirname, "..", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(dir, file), "utf8");
    // libSQL execute() supports multi-statement batches for SQLite files and
    // over HTTP — but to be safe across all transports, split on statement
    // boundaries via batch().
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.replace(/^(\s*--[^\r\n]*\r?\n)+/g, "").trim())
      .filter((s) => s.length > 0);
    await db.batch(statements.map((stmt) => ({ sql: stmt, args: [] })), "write");
    await db.execute({
      sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
      args: [file, Math.floor(Date.now() / 1000)],
    });
    console.log(`+ ${file} applied (${statements.length} statements)`);
  }
  console.log("Migrations up to date.");
  db.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
