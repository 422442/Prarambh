/**
 * Loads the sample question bank (60 questions) from CSV (doc Appendix C
 * format) so the exam can start. Idempotent: skips when the bank already has
 * question_count active questions.
 *
 * Usage: bun run db:seed-questions   (uses TURSO_DATABASE_URL or file:local.db)
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env", override: false });

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const authToken = url!.startsWith("file:") ? undefined : process.env["TURSO_AUTH_TOKEN"];
  const db = authToken ? createClient({ url: url!, authToken }) : createClient({ url: url! });

  const csvPath = join(import.meta.dirname, "..", "migrations", "sample-questions.csv");
  const csv = readFileSync(csvPath, "utf8");

  const { parseQuestionsCsv } = await import("../server/routes/admin-questions-import.ts");
  const { rows, errors } = parseQuestionsCsv(csv);
  if (errors.length > 0) {
    console.error("CSV has validation errors:", errors.slice(0, 5));
    process.exit(1);
  }

  const count = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: [],
  });
  const existing = Number(count.rows[0]?.n ?? 0);
  if (existing >= 60) {
    console.log(`Question bank already has ${existing} active questions — skipped.`);
    db.close();
    return;
  }

  const needed = 60 - existing;
  let inserted = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const row of rows) {
    if (inserted >= needed) break;
    await db.execute({
      sql: "INSERT INTO questions (id, text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      args: [
        randomUUID(),
        row.text,
        row.optionA,
        row.optionB,
        row.optionC,
        row.optionD,
        row.correctOption,
        now,
        now,
      ],
    });
    inserted += 1;
  }
  console.log(`Inserted ${inserted} questions (bank now has ${existing + inserted} active).`);
  db.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
