import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = authToken ? createClient({ url, authToken }) : createClient({ url });

console.log("Checking database tables...\n");

try {
  // Check what tables exist
  const tables = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  console.log("Tables found:", tables.rows.length);
  tables.rows.forEach((row) => console.log("  -", row.name));

  console.log("\n");

  // Check for admins
  if (tables.rows.some((r) => r.name === "admins")) {
    const admins = await db.execute("SELECT id, email, created_at FROM admins");
    console.log("Admins found:", admins.rows.length);
    admins.rows.forEach((row) => console.log("  -", row.email));
  } else {
    console.log("❌ admins table does NOT exist");
  }

  console.log("\n");

  // Check for settings
  if (tables.rows.some((r) => r.name === "settings")) {
    const settings = await db.execute("SELECT COUNT(*) as count FROM settings");
    console.log("Settings rows:", settings.rows[0]?.count);
  } else {
    console.log("❌ settings table does NOT exist");
  }

  console.log("\n");

  // Check for questions
  if (tables.rows.some((r) => r.name === "questions")) {
    const questions = await db.execute("SELECT COUNT(*) as count FROM questions");
    console.log("Questions:", questions.rows[0]?.count);
  } else {
    console.log("❌ questions table does NOT exist");
  }
} catch (error) {
  console.error("Error checking database:", error);
} finally {
  db.close();
}
