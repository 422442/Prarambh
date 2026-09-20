/**
 * Seeds idempotently:
 *  - default settings rows
 *  - the single admin account from ADMIN_EMAIL / ADMIN_PASSWORD (bcrypt hash only)
 *
 * Usage:
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… bun run db:seed
 */
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env", override: false });

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is required (libsql://… or file:local.db)");
  process.exit(1);
}

const DEFAULT_SETTINGS: Array<[string, string]> = [
  ["exam_open", "1"],
  ["duration_minutes", "45"],
  ["question_count", "60"],
  ["marks_correct", "2"],
  ["marks_wrong", "-0.5"],
  ["max_violations", "3"],
  ["clamp_score_at_zero", "0"],
  ["snapshot_interval_seconds", "45"],
  ["snapshot_retention_days", "30"],
];

async function main() {
  const authToken = url!.startsWith("file:") ? undefined : process.env["TURSO_AUTH_TOKEN"];
  const db = url!.startsWith("file:")
    ? createClient({ url: url! })
    : createClient({ url: url!, authToken });

  for (const [key, value] of DEFAULT_SETTINGS) {
    await db.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
      args: [key, value],
    });
  }
  console.log(`Settings seeded (${DEFAULT_SETTINGS.length} keys).`);

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await db.execute({
      sql: "SELECT id FROM admins WHERE email = ?",
      args: [adminEmail],
    });
    if (existing.rows.length > 0) {
      console.log(`Admin ${adminEmail} already exists — skipped.`);
    } else {
      const hash = await bcrypt.hash(adminPassword, 10);
      await db.execute({
        sql: "INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
        args: [randomUUID(), adminEmail, hash, Math.floor(Date.now() / 1000)],
      });
      console.log(`Admin ${adminEmail} created.`);
    }
  } else {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — admin skipped.");
  }

  db.close();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
