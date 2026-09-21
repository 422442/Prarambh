/**
 * Generate bcrypt hash for admin password
 * Usage: node --experimental-strip-types scripts/generate-admin-hash.ts
 */
import bcrypt from "bcryptjs";

const password = process.env.ADMIN_PASSWORD || "CTOPrarambh2026";
const hash = await bcrypt.hash(password, 10);

console.log("\n=== Admin Password Hash ===");
console.log("Password:", password);
console.log("Hash:", hash);
console.log("\n=== SQL Insert Statement ===");
console.log(`
INSERT INTO admins (id, email, password_hash, created_at) 
VALUES (
  'admin-${Date.now()}', 
  'devnest.techclub@gmail.com',
  '${hash}',
  ${Math.floor(Date.now() / 1000)}
);
`);
console.log("\nCopy the INSERT statement above and run it in Turso CLI:");
console.log("  turso db shell prarambh-db");
