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
  const num = (key) => Number(map.get(key) ?? SETTINGS_DEFAULTS[key]);
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
  if (typeof res.status === "function") {
    res.status(web.status);
  } else {
    res.statusCode = web.status;
  }
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

// server/entrypoints/health.ts
function envFlag(name) {
  return process.env[name] ? "set" : "MISSING";
}
async function checkDatabase() {
  try {
    const { getDb: getDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const db = getDb2();
    const result = await db.execute("SELECT COUNT(*) AS questions FROM questions");
    return {
      ok: true,
      detail: `driver loaded, questions=${String(result.rows[0]?.questions ?? "?")}`
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
var health_default = adapter(async () => {
  const checks = {
    runtime: { ok: true, detail: `node ${process.version}` },
    env: {
      ok: Boolean(
        process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN && process.env.SESSION_SECRET
      ),
      detail: `TURSO_DATABASE_URL=${envFlag("TURSO_DATABASE_URL")} TURSO_AUTH_TOKEN=${envFlag(
        "TURSO_AUTH_TOKEN"
      )} SESSION_SECRET=${envFlag("SESSION_SECRET")} CRON_SECRET=${envFlag("CRON_SECRET")}`
    },
    database: await checkDatabase()
  };
  const ok = Object.values(checks).every((check) => check.ok);
  return new Response(JSON.stringify({ ok, checks }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
});
export {
  health_default as default
};
