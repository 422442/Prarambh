/**
 * Smoke tests for the deployed serverless surface (api/**).
 *
 * These go through the real Vercel adapter, the real routing switch and — when
 * TURSO_* credentials are available — the real Turso connection. They exist
 * because a broken module graph (e.g. reaching for the native `libsql` addon,
 * which serverless bundlers cannot trace) crashes every function at cold start
 * with `FUNCTION_INVOCATION_FAILED` before any handler or test double can react.
 *
 * Run: npm test
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import type { VercelLikeRequest, VercelLikeResponse } from "../server/vercel";
import timeRoute from "../server/entrypoints/time";
import healthRoute from "../server/entrypoints/health";
import adminRoute from "../server/entrypoints/admin/[...path]";
import examRoute from "../server/entrypoints/exam/[...path]";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const hasDb = Boolean(process.env.TURSO_DATABASE_URL);
const skipWithoutDb = !hasDb ? "TURSO_DATABASE_URL is not set" : undefined;

type Handler = (req: VercelLikeRequest, res: VercelLikeResponse) => Promise<void>;

function makeReq(
  method: string,
  url: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): VercelLikeRequest {
  return {
    method,
    url,
    headers: {
      host: "prarambh-devnest.vercel.app",
      "x-forwarded-host": "prarambh-devnest.vercel.app",
      "x-forwarded-proto": "https",
      ...opts.headers,
    },
    ...(opts.body === undefined ? {} : { body: opts.body }),
  };
}

async function invoke(
  handler: Handler,
  req: VercelLikeRequest,
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  json: unknown;
}> {
  let status = 0;
  let payload = "";
  const headers: Record<string, string | string[] | undefined> = {};
  const res: VercelLikeResponse = {
    statusCode(value) {
      status = value;
      return value;
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    end(body) {
      if (body === undefined || body === null) return;
      payload = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    },
  };

  await handler(req, res);
  return { status, headers, json: payload ? JSON.parse(payload) : null };
}

describe("serverless API surface", () => {
  it("GET /api/time answers without loading the database driver", async () => {
    const { status, headers, json } = await invoke(timeRoute, makeReq("GET", "/api/time"));

    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("application/json");
    expect(json).toMatchObject({ serverTime: expect.any(Number) });
  });

  it.skipIf(skipWithoutDb)("GET /api/health reports the database as reachable", async () => {
    const { status, json } = await invoke(healthRoute, makeReq("GET", "/api/health"));

    expect(json).toMatchObject({ ok: true, checks: { database: { ok: true } } });
    expect(status).toBe(200);
  });

  it.skipIf(skipWithoutDb)(
    "POST /api/admin/login rejects a malformed body with a JSON 400",
    async () => {
      const { status, json } = await invoke(
        adminRoute,
        makeReq("POST", "/api/admin/login", {
          body: "{not json",
          headers: { "content-type": "application/json" },
        }),
      );

      expect(status).toBe(400);
      expect(json).toMatchObject({ error: { code: "bad_json" } });
    },
  );

  it.skipIf(skipWithoutDb)(
    "POST /api/admin/login rejects bad credentials with the documented error",
    async () => {
      const { status, json } = await invoke(
        adminRoute,
        makeReq("POST", "/api/admin/login", {
          body: { email: "smoke-test@example.com", password: "definitely-not-the-password" },
        }),
      );

      // 401 = wrong credentials, 429 = the rate limiter already saw 5 failures.
      expect([401, 429]).toContain(status);
      expect(json).toMatchObject({
        error: {
          code: expect.stringMatching(/^(unauthorized|rate_limited)$/),
          message: "Incorrect email or password.",
        },
      });
    },
  );

  it.skipIf(skipWithoutDb)("GET /api/admin/stats requires an admin cookie", async () => {
    const { status, json } = await invoke(adminRoute, makeReq("GET", "/api/admin/stats"));

    expect(status).toBe(401);
    expect(json).toMatchObject({ error: { code: "unauthorized" } });
  });

  it.skipIf(skipWithoutDb)("GET /api/exam/status requires a participant cookie", async () => {
    const { status, json } = await invoke(examRoute, makeReq("GET", "/api/exam/status"));

    expect(status).toBe(401);
    expect(json).toMatchObject({ error: { code: "unauthorized" } });
  });

  it.skipIf(skipWithoutDb)("unknown /api subpaths return a JSON 404", async () => {
    const { status, json } = await invoke(examRoute, makeReq("GET", "/api/exam/does-not-exist"));

    expect(status).toBe(404);
    expect(json).toMatchObject({ error: "not found" });
  });
});

describe("generated /api bundles", () => {
  function collectJs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collectJs(full, out);
      else if (entry.name.endsWith(".js")) out.push(full);
    }
    return out;
  }

  it("ships self-contained ESM per route (no relative imports to resolve at cold start)", () => {
    const bundles = collectJs("api");
    expect(bundles.length).toBeGreaterThan(0);

    for (const file of bundles) {
      expect(readFileSync(file, "utf8"), `${file} must not use relative imports`).not.toMatch(
        /(?:from|import\s*\()\s*["']\.\.?\//,
      );
    }
  });
});
