/**
 * Loads every generated function in /api the way Vercel's Node runtime does:
 * as native ESM (package.json sets `"type": "module"`). A relative import
 * without a `.js` extension, or a missing shared file, would crash every route
 * at cold start with FUNCTION_INVOCATION_FAILED — this script fails loudly in
 * the build instead.
 *
 * Usage: node scripts/check-functions.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "api");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const bundles = walk(apiDir).sort();
let failures = 0;

for (const file of bundles) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const source = fs.readFileSync(file, "utf8");
  const relativeImports = source.match(/(?:from|import\s*\()\s*["']\.\.?\//g);
  if (relativeImports) {
    failures += 1;
    console.error(
      `FAIL ${rel}: ${relativeImports.length} relative import(s) — run "npm run build:api"`,
    );
    continue;
  }
  try {
    const mod = await import(pathToFileURL(file).href);
    const handler = mod.default ?? mod;
    if (typeof handler !== "function")
      throw new Error(`default export is ${typeof handler}, expected function`);
    console.log(`OK   ${rel}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${rel}: ${err.message}`);
  }
}

// Exercise the dependency-free canary route end to end.
const canary = path.join(apiDir, "time.js");
if (fs.existsSync(canary)) {
  const handler = (await import(pathToFileURL(canary).href)).default;
  const res = {
    status: 0,
    body: "",
    statusCode(value) {
      this.status = value;
      return value;
    },
    setHeader() {},
    getHeader() {},
    end(body) {
      this.body = body === undefined ? "" : String(body);
    },
  };
  await handler(
    {
      method: "GET",
      url: "/api/time",
      headers: { host: "localhost", "x-forwarded-proto": "https" },
    },
    res,
  );
  if (res.status !== 200) {
    failures += 1;
    console.error(`FAIL /api/time -> ${res.status} ${res.body}`);
  } else {
    console.log(`OK   /api/time -> ${res.status} ${res.body}`);
  }
}

console.log(failures === 0 ? "\nall functions load as native ESM" : `\n${failures} failure(s)`);
process.exitCode = failures === 0 ? 0 : 1;
