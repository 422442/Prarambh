/**
 * Builds the Vercel Serverless Functions in /api.
 *
 * Why this exists: Vercel runs the files in /api as-is, and because this
 * project's package.json sets `"type": "module"`, Node loads the emitted .js
 * files as NATIVE ESM. That means:
 *   1. every relative import needs an explicit `.js` extension
 *      (Node's ESM resolver does not do extensionless resolution), and
 *   2. Vercel's dependency tracer (@vercel/nft) parses files with acorn, which
 *      cannot parse TypeScript syntax — so it silently stops following the
 *      dependencies of any .ts file that contains types/interfaces.
 * Both bit us in production (every /api route returned
 * FUNCTION_INVOCATION_FAILED). Bundling each entry into a single self-contained
 * ESM file removes relative imports and shared-file tracing from the equation
 * entirely: the functions only import npm packages, which the tracer handles.
 *
 * Entry sources live in server/entrypoints/** (NOT in /api, otherwise Vercel
 * would deploy the unbundled TypeScript as well).
 *
 * Usage: node scripts/build-api.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryDir = path.join(root, "server", "entrypoints");
const outDir = path.join(root, "api");

function walk(dir, extension, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extension, out);
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

const entryPoints = walk(entryDir, ".ts").sort();
if (entryPoints.length === 0) throw new Error(`No entry sources found in ${entryDir}`);

// api/ holds generated output only — safe to clear so removed routes disappear.
fs.rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints,
  outdir: outDir,
  outbase: entryDir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Our own multi-file TypeScript graph is bundled into one file per route (no
  // relative imports, nothing for the tracer to miss). npm packages are left
  // external so Node's own loader handles them (correct CJS/ESM interop) and
  // Vercel's tracer only has to follow plain JavaScript dependencies.
  packages: "external",
  logLevel: "warning",
  legalComments: "none",
});

const emitted = walk(outDir, ".js").map((file) => path.relative(root, file).replace(/\\/g, "/"));
for (const file of emitted) {
  const size = (fs.statSync(path.join(root, file)).size / 1024).toFixed(0);
  console.log(`built ${file} (${size} kB)`);
}
