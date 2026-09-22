var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/db.ts
var db_exports = {};
__export(db_exports, {
  SETTINGS_DEFAULTS: () => SETTINGS_DEFAULTS,
  getDb: () => getDb,
  getSettings: () => getSettings,
  nowSec: () => nowSec,
  parseSettings: () => parseSettings,
  toHttpUrl: () => toHttpUrl
});
import { createClient } from "@libsql/client/web";
function toHttpUrl(url) {
  if (url.startsWith("libsql://")) return `https://${url.slice("libsql://".length)}`;
  if (url.startsWith("turso://")) return `https://${url.slice("turso://".length)}`;
  return url;
}
function getDb(env) {
  const rawUrl = (env?.databaseUrl ?? process.env.TURSO_DATABASE_URL ?? "").trim();
  const authToken = (env?.databaseAuthToken ?? process.env.TURSO_AUTH_TOKEN)?.trim();
  if (!rawUrl) throw new Error("TURSO_DATABASE_URL is not set");
  if (rawUrl.startsWith("file:")) {
    throw new Error(
      "TURSO_DATABASE_URL must be a remote libsql:// (or https://) Turso URL for the serverless API; local file: databases are only supported by the scripts."
    );
  }
  const url = toHttpUrl(rawUrl);
  if (cached && cached.url === url && cached.authToken === authToken) return cached.client;
  if (cached) cached.client.close();
  const client = createClient({ url, ...authToken ? { authToken } : {} });
  cached = { url, ...authToken ? { authToken } : {}, client };
  return client;
}
function parseSettings(rows) {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key2) => Number(map.get(key2) ?? SETTINGS_DEFAULTS[key2]);
  return {
    examOpen: (map.get("exam_open") ?? "1") === "1",
    durationMinutes: num("duration_minutes"),
    questionCount: num("question_count"),
    marksCorrect: num("marks_correct"),
    marksWrong: num("marks_wrong"),
    maxViolations: num("max_violations"),
    clampScoreAtZero: (map.get("clamp_score_at_zero") ?? "0") === "1",
    snapshotIntervalSeconds: num("snapshot_interval_seconds"),
    snapshotRetentionDays: num("snapshot_retention_days")
  };
}
async function getSettings(db) {
  const result = await db.execute("SELECT key, value FROM settings");
  return parseSettings(result.rows.map((r) => ({ key: String(r.key), value: String(r.value) })));
}
var cached, SETTINGS_DEFAULTS, nowSec;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    cached = null;
    SETTINGS_DEFAULTS = {
      exam_open: "1",
      duration_minutes: "45",
      question_count: "60",
      marks_correct: "2",
      marks_wrong: "-0.5",
      max_violations: "3",
      clamp_score_at_zero: "0",
      snapshot_interval_seconds: "45",
      snapshot_retention_days: "30"
    };
    nowSec = () => Math.floor(Date.now() / 1e3);
  }
});

// server/http.ts
var ApiError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
function json(data, init) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status: init?.status ?? 200, headers });
}
function errorResponse(err, context) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error(`[api] unhandled error${context ? ` in ${context}` : ""}:`, err);
  return json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key2 = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key2) out[key2] = decodeURIComponent(value);
  }
  return out;
}
async function readJson(request, schema2) {
  let raw;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "bad_json", "Request body must be valid JSON.");
  }
  const result = schema2.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path?.length ? ` at "${first.path.join(".")}"` : "";
    throw new ApiError(400, "invalid_body", `${first?.message ?? "Invalid request body."}${where}`);
  }
  return result.data;
}

// server/vercel.ts
function buildRequestUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0]?.trim() || "https";
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  const pathAndQuery = req.url && req.url.startsWith("/") ? req.url : "/";
  return `${proto}://${host}${pathAndQuery}`;
}
async function toWebRequest(req) {
  const url = buildRequestUrl(req);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else {
      headers.set(name, value);
    }
  }
  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let body;
  if (hasBody) {
    if (req.body === void 0 || req.body === null) {
      body = void 0;
    } else if (typeof req.body === "string") {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }
  return new Request(url, { method, headers, body: body ?? null });
}
async function sendWebResponse(web, res) {
  res.statusCode(web.status);
  web.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") return;
    res.setHeader(name, value);
  });
  let cookies = [];
  if (typeof web.headers.getSetCookie === "function") {
    cookies = web.headers.getSetCookie();
  }
  if (cookies.length === 0) {
    const rawCookie = web.headers.get("set-cookie");
    if (rawCookie) cookies = [rawCookie];
  }
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  const buffer = await web.arrayBuffer();
  if (buffer.byteLength > 0) {
    res.end(Buffer.from(buffer));
  } else {
    res.end();
  }
}
function adapter(core) {
  return async (req, res) => {
    try {
      const request = await toWebRequest(req);
      const response = await core(request);
      await sendWebResponse(response, res);
    } catch (err) {
      try {
        const response = errorResponse(err, `${req.method ?? "GET"} ${req.url ?? "/"}`);
        await sendWebResponse(response, res);
      } catch {
      }
    }
  };
}

// server/env.ts
function getEnv(overrides) {
  const env = {
    sessionSecret: overrides?.sessionSecret ?? process.env.SESSION_SECRET ?? ""
  };
  const cron = overrides?.cronSecret ?? process.env.CRON_SECRET;
  if (cron !== void 0) env.cronSecret = cron;
  const blob = overrides?.blobToken ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (blob !== void 0) env.blobToken = blob;
  const dbUrl = overrides?.databaseUrl ?? process.env.TURSO_DATABASE_URL;
  if (dbUrl !== void 0) env.databaseUrl = dbUrl;
  const dbAuth = overrides?.databaseAuthToken ?? process.env.TURSO_AUTH_TOKEN;
  if (dbAuth !== void 0) env.databaseAuthToken = dbAuth;
  return env;
}

// server/context.ts
async function makeContext() {
  const env = getEnv();
  const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  return { env, db: getDb2(env) };
}

// server/routes/terms.ts
import { z } from "zod";
init_db();

// server/auth.ts
import { SignJWT, jwtVerify } from "jose";
var PARTICIPANT_COOKIE = "tq_participant";
var PARTICIPANT_MAX_AGE = 12 * 60 * 60;
var ADMIN_MAX_AGE = 8 * 60 * 60;
function key(secret) {
  return new TextEncoder().encode(secret);
}
async function verifyToken(secret, token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload;
  } catch {
    return null;
  }
}
async function requireParticipantClaims(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const claims = await verifyToken(
    env.sessionSecret,
    cookies[PARTICIPANT_COOKIE]
  );
  if (!claims?.sub || !claims?.sid) {
    throw new ApiError(401, "unauthorized", "Please log in to continue.");
  }
  return claims;
}

// server/routes/terms.ts
var schema = z.object({
  termsVersion: z.string().min(1).max(32)
});
async function handleTermsAccept(request, db, env) {
  const claims = await requireParticipantClaims(request, env);
  const body = await readJson(request, schema);
  const now = nowSec();
  const result = await db.execute({
    sql: `UPDATE participants
          SET terms_version = ?, terms_accepted_at = ?, camera_consent_at = COALESCE(camera_consent_at, ?)
          WHERE id = ?`,
    args: [body.termsVersion, now, now, claims.sub]
  });
  if (result.rowsAffected === 0)
    throw new ApiError(401, "unauthorized", "Please log in to continue.");
  return json({ ok: true });
}

// server/entrypoints/terms/accept.ts
var accept_default = adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleTermsAccept(request, db, env);
});
export {
  accept_default as default
};
