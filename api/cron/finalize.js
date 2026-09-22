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

// server/attempt.ts
init_db();

// server/scoring.ts
function computeScore(counts, marks) {
  const raw = counts.correct * marks.marksCorrect + counts.wrong * marks.marksWrong;
  const score = marks.clampAtZero ? Math.max(0, raw) : raw;
  return {
    score: Math.round(score * 100) / 100,
    // avoid float artifacts like 72.49999999
    correct: counts.correct,
    wrong: counts.wrong,
    unanswered: counts.unanswered
  };
}
function timeTakenSeconds(startedAtSec, submittedAtSec, durationSec) {
  return Math.min(Math.max(0, submittedAtSec - startedAtSec), durationSec);
}

// server/attempt.ts
var GRACE_SECONDS = 10;
function mapAttempt(row) {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    status: row.status === "submitted" ? "submitted" : "in_progress",
    submit_reason: row.submit_reason ?? null,
    started_at: Number(row.started_at),
    ends_at: Number(row.ends_at),
    submitted_at: row.submitted_at == null ? null : Number(row.submitted_at),
    question_order: String(row.question_order),
    session_id: String(row.session_id),
    score: row.score == null ? null : Number(row.score),
    correct_count: row.correct_count == null ? null : Number(row.correct_count),
    wrong_count: row.wrong_count == null ? null : Number(row.wrong_count),
    unanswered_count: row.unanswered_count == null ? null : Number(row.unanswered_count),
    time_taken_seconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
    violation_count: Number(row.violation_count ?? 0),
    ip_address: row.ip_address == null ? null : String(row.ip_address),
    user_agent: row.user_agent == null ? null : String(row.user_agent)
  };
}
async function getAttemptById(db, attemptId) {
  const result = await db.execute({
    sql: "SELECT * FROM attempts WHERE id = ?",
    args: [attemptId]
  });
  const row = result.rows[0];
  return row ? mapAttempt(row) : null;
}
function parseQuestionOrder(json2) {
  try {
    const parsed = JSON.parse(json2);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e && typeof e.qid === "string" && Array.isArray(e.options)).map((e) => ({ qid: e.qid, options: e.options }));
  } catch {
    return [];
  }
}
async function finalizeAttempt(db, attemptId, reason, submittedAtSec = nowSec(), settings) {
  const existing = await getAttemptById(db, attemptId);
  if (!existing) throw new Error(`Attempt ${attemptId} not found`);
  if (existing.status === "submitted") return existing;
  const s = settings ?? await getSettings(db);
  const order = parseQuestionOrder(existing.question_order);
  const qids = order.map((o) => o.qid);
  const correctByKey = /* @__PURE__ */ new Map();
  if (qids.length > 0) {
    const placeholders = qids.map(() => "?").join(",");
    const stmt = {
      sql: `SELECT id, correct_option FROM questions WHERE id IN (${placeholders})`,
      args: qids
    };
    const result = await db.execute(stmt);
    for (const row of result.rows) {
      correctByKey.set(String(row.id), String(row.correct_option));
    }
  }
  const answers = /* @__PURE__ */ new Map();
  const answerRows = await db.execute({
    sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
    args: [attemptId]
  });
  for (const row of answerRows.rows) {
    answers.set(
      String(row.question_id),
      row.selected_option == null ? null : String(row.selected_option)
    );
  }
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const { qid } of order) {
    const selected = answers.get(qid) ?? null;
    if (!selected) {
      unanswered += 1;
    } else if (selected === correctByKey.get(qid)) {
      correct += 1;
    } else {
      wrong += 1;
    }
  }
  const durationSec = s.durationMinutes * 60;
  const submittedAt = reason === "time_up" ? Math.min(submittedAtSec, existing.ends_at) : submittedAtSec;
  const scored = computeScore(
    { correct, wrong, unanswered },
    {
      marksCorrect: s.marksCorrect,
      marksWrong: s.marksWrong,
      clampAtZero: s.clampScoreAtZero
    }
  );
  const taken = timeTakenSeconds(existing.started_at, submittedAt, durationSec);
  await db.execute({
    sql: `UPDATE attempts
          SET status = 'submitted',
              submit_reason = ?,
              submitted_at = ?,
              score = ?,
              correct_count = ?,
              wrong_count = ?,
              unanswered_count = ?,
              time_taken_seconds = ?
          WHERE id = ? AND status = 'in_progress'`,
    args: [
      reason,
      submittedAt,
      scored.score,
      scored.correct,
      scored.wrong,
      scored.unanswered,
      taken,
      attemptId
    ]
  });
  const fresh = await getAttemptById(db, attemptId);
  return fresh ?? { ...existing, status: "submitted", submit_reason: reason, submitted_at: submittedAt };
}
async function finalizeExpiredAttempts(db, now = nowSec()) {
  const result = await db.execute({
    sql: "SELECT id FROM attempts WHERE status = 'in_progress' AND ends_at + ? < ?",
    args: [GRACE_SECONDS, now]
  });
  let count = 0;
  for (const row of result.rows) {
    await finalizeAttempt(db, String(row.id), "time_up", now);
    count += 1;
  }
  return count;
}

// server/routes/cron.ts
function assertCronSecret(request, env) {
  const expected = env.cronSecret;
  if (!expected) throw new ApiError(500, "misconfigured", "CRON_SECRET is not set.");
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (bearer !== expected && querySecret !== expected) {
    throw new ApiError(401, "unauthorized", "Cron authentication required.");
  }
}
async function handleCronFinalize(request, db, env) {
  assertCronSecret(request, env);
  const finalized = await finalizeExpiredAttempts(db);
  return json({ ok: true, finalized });
}

// server/entrypoints/cron/finalize.ts
var finalize_default = adapter(async (request) => {
  const { env, db } = await makeContext();
  return handleCronFinalize(request, db, env);
});
export {
  finalize_default as default
};
