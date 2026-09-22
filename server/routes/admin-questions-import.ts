/**
 * POST /api/admin/questions/import — two-step CSV import.
 *   {action:"validate", csv}                      → per-row preview + errors
 *   {action:"commit", csv, importMode}            → insert rows
 * Modes: append | replace_all. Replace-all is blocked while any attempt
 * exists at all (doc §7: "Replace is blocked once any attempt exists") and
 * while an exam is in progress (prompt).
 * CSV columns: question,option_a,option_b,option_c,option_d,correct
 */
import { z } from "zod";
import Papa from "papaparse";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { json, readJson, ApiError, type ServerEnv } from "../http";
import { nowSec } from "../db";
import { requireAdmin } from "../auth";
import { hasAttemptInProgress } from "../attempt";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("validate"), csv: z.string().min(1).max(2_000_000) }),
  z.object({
    action: z.literal("commit"),
    csv: z.string().min(1).max(2_000_000),
    importMode: z.enum(["append", "replace_all"]),
  }),
]);

export type CsvRow = {
  row: number;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
};

export type CsvError = { row: number; message: string };

export function parseQuestionsCsv(csv: string): { rows: CsvRow[]; errors: CsvError[] } {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const errors: CsvError[] = [];
  const required = ["question", "option_a", "option_b", "option_c", "option_d", "correct"];
  const fields = parsed.meta?.fields ?? [];
  for (const col of required) {
    if (!fields.includes(col)) {
      errors.push({ row: 1, message: `Missing required column "${col}".` });
    }
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: CsvRow[] = [];
  parsed.data.forEach((data, i) => {
    const rowNumber = i + 2; // header is row 1
    const text = (data["question"] ?? "").trim();
    const a = (data["option_a"] ?? "").trim();
    const b = (data["option_b"] ?? "").trim();
    const c = (data["option_c"] ?? "").trim();
    const d = (data["option_d"] ?? "").trim();
    const correct = (data["correct"] ?? "").trim().toUpperCase();

    if (!text) errors.push({ row: rowNumber, message: "Question text is required." });
    if (!a || !b || !c || !d)
      errors.push({ row: rowNumber, message: "All four options are required." });
    if (correct !== "A" && correct !== "B" && correct !== "C" && correct !== "D") {
      errors.push({ row: rowNumber, message: `"correct" must be A, B, C or D.` });
    }
    if (
      text &&
      a &&
      b &&
      c &&
      d &&
      (correct === "A" || correct === "B" || correct === "C" || correct === "D")
    ) {
      rows.push({
        row: rowNumber,
        text,
        optionA: a,
        optionB: b,
        optionC: c,
        optionD: d,
        correctOption: correct,
      });
    }
  });

  return { rows, errors };
}

export async function handleAdminQuestionsImport(
  request: Request,
  db: Client,
  env: ServerEnv,
): Promise<Response> {
  await requireAdmin(request, env);
  const body = await readJson(request, schema);
  const { rows, errors } = parseQuestionsCsv(body.csv);

  if (body.action === "validate") {
    return json({ rows, errors, validCount: rows.length, errorCount: errors.length });
  }

  if (rows.length === 0) {
    throw new ApiError(400, "no_valid_rows", "There are no valid rows to import.");
  }
  if (errors.length > 0) {
    throw new ApiError(400, "invalid_rows", "Fix the highlighted rows before committing.");
  }

  if (body.importMode === "replace_all") {
    if (await hasAttemptInProgress(db)) {
      throw new ApiError(
        409,
        "exam_in_progress",
        "Questions cannot be replaced while an exam is in progress.",
      );
    }
    const anyAttempt = await db.execute({ sql: "SELECT 1 FROM attempts LIMIT 1", args: [] });
    if (anyAttempt.rows.length > 0) {
      throw new ApiError(409, "attempts_exist", "Replace-all is blocked once any attempt exists.");
    }
    await db.execute({ sql: "DELETE FROM answers", args: [] });
    await db.execute({ sql: "DELETE FROM questions", args: [] });
  } else if (await hasAttemptInProgress(db)) {
    throw new ApiError(
      409,
      "exam_in_progress",
      "Questions cannot be added while an exam is in progress.",
    );
  }

  const now = nowSec();
  for (const row of rows) {
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
  }

  return json({ ok: true, inserted: rows.length, importMode: body.importMode });
}
