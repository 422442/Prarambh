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
function buildSetCookie(name, value, opts) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? "/"}`,
    `Max-Age=${opts.maxAgeSec}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
async function readJson(request, schema4) {
  let raw;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "bad_json", "Request body must be valid JSON.");
  }
  const result = schema4.safeParse(raw);
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

// server/routes/admin-login.ts
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
init_db();

// server/auth.ts
import { SignJWT, jwtVerify } from "jose";
var ADMIN_COOKIE = "tq_admin";
var PARTICIPANT_MAX_AGE = 12 * 60 * 60;
var ADMIN_MAX_AGE = 8 * 60 * 60;
function key(secret) {
  return new TextEncoder().encode(secret);
}
async function signToken(secret, payload, maxAgeSec) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1e3) + maxAgeSec).sign(key(secret));
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
function isSecureRequest(request) {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  return request.url.startsWith("https://");
}
function adminSetCookie(request, env, token) {
  return buildSetCookie(ADMIN_COOKIE, token, {
    maxAgeSec: ADMIN_MAX_AGE,
    secure: isSecureRequest(request)
  });
}
function clearCookie(name, secure) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
async function requireAdmin(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const claims = await verifyToken(env.sessionSecret, cookies[ADMIN_COOKIE]);
  if (!claims || claims.role !== "admin" || !claims.sub) {
    throw new ApiError(401, "unauthorized", "Admin authentication required.");
  }
  return claims;
}

// server/routes/admin-login.ts
var schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200)
});
var RATE_LIMIT_WINDOW_SEC = 15 * 60;
var RATE_LIMIT_MAX_FAILURES = 5;
var GENERIC_LOGIN_ERROR = "Incorrect email or password.";
async function handleAdminLogin(request, db, env) {
  const body = await readJson(request, schema);
  const ip = ipOf(request);
  const bucketKey = createHash("sha256").update(`${ip}|${body.email}|admin_login`).digest("hex").slice(0, 40);
  const now = nowSec();
  let row;
  try {
    const limit = await db.execute({
      sql: "SELECT window_start, fail_count FROM rate_limits WHERE id = ? AND bucket = 'admin_login'",
      args: [bucketKey]
    });
    row = limit.rows[0];
    if (row) {
      const windowStart = Number(row.window_start);
      const expired = now - windowStart >= RATE_LIMIT_WINDOW_SEC;
      if (!expired && Number(row.fail_count) >= RATE_LIMIT_MAX_FAILURES) {
        throw new ApiError(429, "rate_limited", GENERIC_LOGIN_ERROR);
      }
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }
  let admin;
  try {
    const admins = await db.execute({
      sql: "SELECT id, email, password_hash FROM admins WHERE email = ?",
      args: [body.email]
    });
    admin = admins.rows[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      throw new ApiError(
        500,
        "db_not_migrated",
        "Database is not migrated yet. Please run 'pnpm db:migrate' and 'pnpm db:seed'."
      );
    }
    throw err;
  }
  const ok = admin ? await bcrypt.compare(body.password, String(admin.password_hash)) : false;
  if (!ok || !admin) {
    try {
      if (row && now - Number(row.window_start) < RATE_LIMIT_WINDOW_SEC) {
        await db.execute({
          sql: "UPDATE rate_limits SET fail_count = fail_count + 1 WHERE id = ?",
          args: [bucketKey]
        });
      } else {
        await db.execute({
          sql: `INSERT INTO rate_limits (id, bucket, window_start, fail_count) VALUES (?, 'admin_login', ?, 1)
                ON CONFLICT(id) DO UPDATE SET window_start = excluded.window_start, fail_count = excluded.fail_count`,
          args: [bucketKey, now]
        });
      }
    } catch {
    }
    throw new ApiError(401, "unauthorized", GENERIC_LOGIN_ERROR);
  }
  try {
    await db.execute({ sql: "DELETE FROM rate_limits WHERE id = ?", args: [bucketKey] });
  } catch {
  }
  try {
    await db.execute({
      sql: "INSERT INTO admin_audit (id, admin_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [randomUUID(), String(admin.id), "login", body.email, null, now]
    });
  } catch {
  }
  const token = await signToken(
    env.sessionSecret,
    { sub: String(admin.id), role: "admin" },
    ADMIN_MAX_AGE
  );
  return json(
    { ok: true, email: String(admin.email) },
    { headers: { "set-cookie": adminSetCookie(request, env, token) } }
  );
}
function ipOf(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

// server/routes/admin-session.ts
async function handleAdminLogout(request, db, env) {
  void db;
  return json(
    { ok: true },
    { headers: { "set-cookie": clearCookie(ADMIN_COOKIE, isSecureRequest(request)) } }
  );
}
async function handleAdminSession(request, db, env) {
  const admin = await requireAdmin(request, env);
  const rows = await db.execute({
    sql: "SELECT email FROM admins WHERE id = ?",
    args: [admin.sub]
  });
  const email = rows.rows[0] ? String(rows.rows[0].email) : null;
  return json({ authenticated: true, email });
}

// server/routes/admin-stats.ts
init_db();

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
async function getAttemptByParticipant(db, participantId) {
  const result = await db.execute({
    sql: "SELECT * FROM attempts WHERE participant_id = ?",
    args: [participantId]
  });
  const row = result.rows[0];
  return row ? mapAttempt(row) : null;
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
async function ensureNotExpired(db, attempt, now = nowSec(), settings) {
  if (attempt.status === "in_progress" && now > attempt.ends_at + GRACE_SECONDS) {
    return finalizeAttempt(db, attempt.id, "time_up", Math.max(now, attempt.ends_at), settings);
  }
  return attempt;
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
async function hasAttemptInProgress(db) {
  const result = await db.execute({
    sql: "SELECT 1 FROM attempts WHERE status = 'in_progress' LIMIT 1",
    args: []
  });
  return result.rows.length > 0;
}

// server/routes/admin-stats.ts
async function handleAdminStats(request, db, env) {
  await requireAdmin(request, env);
  await finalizeExpiredAttempts(db);
  const settings = await getSettings(db);
  const registered = await db.execute({ sql: "SELECT COUNT(*) AS n FROM participants", args: [] });
  const attempts = await db.execute({
    sql: "SELECT status, score, time_taken_seconds, violation_count FROM attempts",
    args: []
  });
  let inProgress = 0;
  let submitted = 0;
  let flagged = 0;
  let scoreSum = 0;
  let timeSum = 0;
  for (const row of attempts.rows) {
    const status = String(row.status);
    const violations = Number(row.violation_count ?? 0);
    if (violations > 0) flagged += 1;
    if (status === "submitted") {
      submitted += 1;
      scoreSum += Number(row.score ?? 0);
      timeSum += Number(row.time_taken_seconds ?? 0);
    } else {
      inProgress += 1;
    }
  }
  const registeredCount = Number(registered.rows[0]?.n ?? 0);
  const activeQuestions = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: []
  });
  return json({
    registered: registeredCount,
    inProgress,
    submitted,
    flagged,
    avgScore: submitted > 0 ? Math.round(scoreSum / submitted * 100) / 100 : null,
    avgTimeSeconds: submitted > 0 ? Math.round(timeSum / submitted) : null,
    activeQuestions: Number(activeQuestions.rows[0]?.n ?? 0),
    questionCount: settings.questionCount,
    examOpen: settings.examOpen,
    snapshotRetentionDays: settings.snapshotRetentionDays
  });
}

// server/routes/admin-participants.ts
var SORTABLE = {
  score: "a.score",
  time: "a.time_taken_seconds",
  name: "p.name",
  email: "p.email",
  submitted_at: "a.submitted_at"
};
async function handleAdminParticipants(request, db, env) {
  await requireAdmin(request, env);
  await finalizeExpiredAttempts(db);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(url.searchParams.get("pageSize") ?? "20") || 20)
  );
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "all";
  const flagged = url.searchParams.get("flagged") === "1";
  const sortKey = url.searchParams.get("sort") ?? "rank";
  const dir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  const where = [];
  const args = [];
  if (q) {
    where.push("(LOWER(p.name) LIKE ? OR p.email LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (status === "submitted") where.push("a.status = 'submitted'");
  if (status === "in_progress") where.push("a.status = 'in_progress'");
  if (status === "registered") where.push("a.id IS NULL");
  if (flagged) where.push("a.violation_count > 0");
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const totalRows = await db.execute({
    sql: `SELECT COUNT(*) AS n
          FROM participants p
          LEFT JOIN attempts a ON a.participant_id = p.id
          ${whereSql}`,
    args
  });
  const total = Number(totalRows.rows[0]?.n ?? 0);
  const orderBy = sortKey === "rank" || !SORTABLE[sortKey] ? "ORDER BY CASE WHEN a.status = 'submitted' THEN 0 ELSE 1 END, a.score DESC, a.time_taken_seconds ASC, p.created_at ASC" : `ORDER BY ${SORTABLE[sortKey]} ${dir} NULLS LAST`;
  const list = await db.execute({
    sql: `SELECT p.id AS pid, p.name, p.email,
                 a.id AS aid, a.status, a.score, a.correct_count, a.wrong_count,
                 a.unanswered_count, a.time_taken_seconds, a.violation_count,
                 a.submitted_at, a.submit_reason
          FROM participants p
          LEFT JOIN attempts a ON a.participant_id = p.id
          ${whereSql}
          ${orderBy}
          LIMIT ? OFFSET ?`,
    args: [...args, pageSize, (page - 1) * pageSize]
  });
  const rankRows = await db.execute({
    sql: `SELECT participant_id FROM attempts WHERE status = 'submitted'
          ORDER BY score DESC, time_taken_seconds ASC`,
    args: []
  });
  const rankByParticipant = /* @__PURE__ */ new Map();
  rankRows.rows.forEach((row, i) => rankByParticipant.set(String(row.participant_id), i + 1));
  const rows = list.rows.map((row) => {
    const pid = String(row.pid);
    const attemptId = row.aid == null ? null : String(row.aid);
    const status2 = attemptId == null ? "registered" : row.status === "submitted" ? "submitted" : "in_progress";
    return {
      participantId: pid,
      name: String(row.name),
      email: String(row.email),
      status: status2,
      score: row.score == null ? null : Number(row.score),
      correct: row.correct_count == null ? null : Number(row.correct_count),
      wrong: row.wrong_count == null ? null : Number(row.wrong_count),
      unanswered: row.unanswered_count == null ? null : Number(row.unanswered_count),
      timeTakenSeconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
      violations: Number(row.violation_count ?? 0),
      submittedAt: row.submitted_at == null ? null : Number(row.submitted_at),
      submitReason: row.submit_reason == null ? null : String(row.submit_reason),
      rank: rankByParticipant.get(pid) ?? null
    };
  });
  return json({ rows, total, page, pageSize });
}
async function fetchAllResultRows(db, filters) {
  const where = [];
  const args = [];
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    where.push("(LOWER(p.name) LIKE ? OR p.email LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (filters.flaggedOnly) where.push("a.violation_count > 0");
  if (filters.status === "submitted") where.push("a.status = 'submitted'");
  if (filters.status === "in_progress") where.push("a.status = 'in_progress'");
  if (filters.status === "registered") where.push("a.id IS NULL");
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const list = await db.execute({
    sql: `SELECT p.id AS pid, p.name, p.email,
                 a.id AS aid, a.status, a.score, a.correct_count, a.wrong_count,
                 a.unanswered_count, a.time_taken_seconds, a.violation_count,
                 a.submitted_at, a.submit_reason
          FROM participants p
          LEFT JOIN attempts a ON a.participant_id = p.id
          ${whereSql}
          ORDER BY CASE WHEN a.status = 'submitted' THEN 0 ELSE 1 END,
                   a.score DESC, a.time_taken_seconds ASC, p.created_at ASC`,
    args
  });
  const rankRows = await db.execute({
    sql: `SELECT participant_id FROM attempts WHERE status = 'submitted'
          ORDER BY score DESC, time_taken_seconds ASC`,
    args: []
  });
  const rankByParticipant = /* @__PURE__ */ new Map();
  rankRows.rows.forEach((row, i) => rankByParticipant.set(String(row.participant_id), i + 1));
  return list.rows.map((row) => {
    const pid = String(row.pid);
    const attemptId = row.aid == null ? null : String(row.aid);
    const status = attemptId == null ? "registered" : row.status === "submitted" ? "submitted" : "in_progress";
    return {
      participantId: pid,
      name: String(row.name),
      email: String(row.email),
      status,
      score: row.score == null ? null : Number(row.score),
      correct: row.correct_count == null ? null : Number(row.correct_count),
      wrong: row.wrong_count == null ? null : Number(row.wrong_count),
      unanswered: row.unanswered_count == null ? null : Number(row.unanswered_count),
      timeTakenSeconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
      violations: Number(row.violation_count ?? 0),
      submittedAt: row.submitted_at == null ? null : Number(row.submitted_at),
      submitReason: row.submit_reason == null ? null : String(row.submit_reason),
      rank: rankByParticipant.get(pid) ?? null
    };
  });
}

// server/routes/admin-export.ts
function csvEscape(value) {
  if (value === null || value === void 0) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function formatDuration(totalSeconds) {
  if (totalSeconds === null) return "";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
async function handleAdminExport(request, db, env) {
  await requireAdmin(request, env);
  await finalizeExpiredAttempts(db);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const flagged = url.searchParams.get("flagged") === "1";
  const rows = await fetchAllResultRows(db, { q, flaggedOnly: flagged });
  const header = [
    "rank",
    "name",
    "email",
    "status",
    "score",
    "correct",
    "wrong",
    "unanswered",
    "time_taken",
    "violations",
    "submitted_at",
    "submit_reason"
  ].join(",");
  const lines = rows.map(
    (r) => [
      r.rank ?? "",
      csvEscape(r.name),
      r.email,
      r.status,
      r.score ?? "",
      r.correct ?? "",
      r.wrong ?? "",
      r.unanswered ?? "",
      formatDuration(r.timeTakenSeconds),
      r.violations,
      r.submittedAt ? new Date(r.submittedAt * 1e3).toISOString() : "",
      r.submitReason ?? ""
    ].join(",")
  );
  const body = [header, ...lines].join("\r\n");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="tech-quiz-results.csv"',
      "cache-control": "no-store"
    }
  });
}

// server/routes/admin-settings.ts
import { z as z2 } from "zod";
init_db();
var schema2 = z2.object({
  examOpen: z2.boolean().optional(),
  snapshotRetentionDays: z2.number().int().min(1).max(365).optional(),
  clampScoreAtZero: z2.boolean().optional()
});
async function handleAdminSettingsUpdate(request, db, env) {
  await requireAdmin(request, env);
  const body = await readJson(request, schema2);
  const updates = [];
  if (body.examOpen !== void 0) updates.push(["exam_open", body.examOpen ? "1" : "0"]);
  if (body.snapshotRetentionDays !== void 0)
    updates.push(["snapshot_retention_days", String(body.snapshotRetentionDays)]);
  if (body.clampScoreAtZero !== void 0)
    updates.push(["clamp_score_at_zero", body.clampScoreAtZero ? "1" : "0"]);
  for (const [key2, value] of updates) {
    await db.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [key2, value]
    });
  }
  const settings = await getSettings(db);
  return json({
    settings: {
      examOpen: settings.examOpen,
      snapshotRetentionDays: settings.snapshotRetentionDays,
      clampScoreAtZero: settings.clampScoreAtZero,
      durationMinutes: settings.durationMinutes,
      questionCount: settings.questionCount,
      marksCorrect: settings.marksCorrect,
      marksWrong: settings.marksWrong,
      maxViolations: settings.maxViolations
    }
  });
}

// server/routes/admin-reset-all.ts
async function handleAdminResetAll(request, db, env) {
  await requireAdmin(request, env);
  await db.execute("DELETE FROM snapshots");
  await db.execute("DELETE FROM violations");
  await db.execute("DELETE FROM answers");
  await db.execute("DELETE FROM attempts");
  await db.execute("DELETE FROM participants");
  return json({ ok: true, message: "All exam attempts and participants reset successfully." });
}

// server/routes/admin-participant-detail.ts
async function handleAdminParticipantDetail(request, db, env, participantId) {
  await requireAdmin(request, env);
  const pRows = await db.execute({
    sql: "SELECT id, name, email, last_login_name, terms_version, terms_accepted_at, camera_consent_at, created_at FROM participants WHERE id = ?",
    args: [participantId]
  });
  const p = pRows.rows[0];
  if (!p) throw new ApiError(404, "not_found", "Participant not found.");
  const attemptRow = await getAttemptByParticipant(db, participantId);
  const attempt = attemptRow ? await ensureNotExpired(db, attemptRow) : null;
  const answers = [];
  if (attempt) {
    const order = parseQuestionOrder(attempt.question_order);
    const savedAnswers = /* @__PURE__ */ new Map();
    const aRows = await db.execute({
      sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
      args: [attempt.id]
    });
    for (const row of aRows.rows) {
      savedAnswers.set(
        String(row.question_id),
        row.selected_option == null ? null : String(row.selected_option)
      );
    }
    for (const entry of order) {
      const q = await db.execute({
        sql: "SELECT id, text, option_a, option_b, option_c, option_d, correct_option FROM questions WHERE id = ?",
        args: [entry.qid]
      });
      const qRow = q.rows[0];
      if (!qRow) continue;
      const chosen = savedAnswers.get(entry.qid) ?? null;
      const correct = String(qRow.correct_option);
      answers.push({
        questionId: entry.qid,
        text: String(qRow.text),
        options: {
          A: String(qRow.option_a),
          B: String(qRow.option_b),
          C: String(qRow.option_c),
          D: String(qRow.option_d)
        },
        chosen,
        correct,
        result: !chosen ? "unanswered" : chosen === correct ? "correct" : "wrong"
      });
    }
  }
  const violations = await db.execute({
    sql: "SELECT id, type, occurred_at, meta FROM violations WHERE attempt_id = ? ORDER BY occurred_at ASC",
    args: [attempt?.id ?? "none"]
  });
  const snapshots = await db.execute({
    sql: "SELECT id, blob_url, kind, face_count, taken_at FROM snapshots WHERE attempt_id = ? ORDER BY taken_at ASC",
    args: [attempt?.id ?? "none"]
  });
  return json({
    participant: {
      id: String(p.id),
      name: String(p.name),
      email: String(p.email),
      lastLoginName: p.last_login_name == null ? null : String(p.last_login_name),
      nameMismatch: p.last_login_name != null && String(p.last_login_name) !== String(p.name),
      termsVersion: p.terms_version == null ? null : String(p.terms_version),
      termsAcceptedAt: p.terms_accepted_at == null ? null : Number(p.terms_accepted_at),
      cameraConsentAt: p.camera_consent_at == null ? null : Number(p.camera_consent_at),
      createdAt: Number(p.created_at)
    },
    attempt: attempt ? {
      id: attempt.id,
      status: attempt.status,
      submitReason: attempt.submit_reason,
      startedAt: attempt.started_at,
      endsAt: attempt.ends_at,
      submittedAt: attempt.submitted_at,
      score: attempt.score,
      correct: attempt.correct_count,
      wrong: attempt.wrong_count,
      unanswered: attempt.unanswered_count,
      timeTakenSeconds: attempt.time_taken_seconds,
      violations: attempt.violation_count,
      ipAddress: attempt.ip_address,
      userAgent: attempt.user_agent
    } : null,
    answers,
    violations: violations.rows.map((row) => ({
      id: String(row.id),
      type: String(row.type),
      occurredAt: Number(row.occurred_at),
      meta: row.meta == null ? null : String(row.meta)
    })),
    snapshots: snapshots.rows.map((row) => ({
      id: String(row.id),
      url: String(row.blob_url),
      kind: String(row.kind),
      faceCount: row.face_count == null ? null : Number(row.face_count),
      takenAt: Number(row.taken_at)
    }))
  });
}

// server/routes/admin-reset.ts
import { randomUUID as randomUUID2 } from "node:crypto";
init_db();
async function handleAdminReset(request, db, env, participantId) {
  const admin = await requireAdmin(request, env);
  const pRows = await db.execute({
    sql: "SELECT id, email FROM participants WHERE id = ?",
    args: [participantId]
  });
  const p = pRows.rows[0];
  if (!p) throw new ApiError(404, "not_found", "Participant not found.");
  const attempt = await getAttemptByParticipant(db, participantId);
  let deletedSnapshots = 0;
  if (attempt) {
    const snapshotRows = await db.execute({
      sql: "SELECT id, blob_url FROM snapshots WHERE attempt_id = ?",
      args: [attempt.id]
    });
    if (env.blobToken && snapshotRows.rows.length > 0) {
      try {
        const { del } = await import("@vercel/blob");
        await del(
          snapshotRows.rows.map((r) => String(r.blob_url)),
          { token: env.blobToken }
        );
      } catch (err) {
        console.error("[admin-reset] blob deletion failed:", err);
      }
    }
    deletedSnapshots = snapshotRows.rows.length;
    await db.execute({ sql: "DELETE FROM snapshots WHERE attempt_id = ?", args: [attempt.id] });
    await db.execute({ sql: "DELETE FROM violations WHERE attempt_id = ?", args: [attempt.id] });
    await db.execute({ sql: "DELETE FROM answers WHERE attempt_id = ?", args: [attempt.id] });
    await db.execute({ sql: "DELETE FROM attempts WHERE id = ?", args: [attempt.id] });
  }
  await db.execute({
    sql: "INSERT INTO admin_audit (id, admin_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      randomUUID2(),
      admin.sub,
      "reset_attempt",
      String(p.email),
      JSON.stringify({ attemptDeleted: !!attempt, snapshotsDeleted: deletedSnapshots }),
      nowSec()
    ]
  });
  return json({ ok: true, attemptDeleted: !!attempt, snapshotsDeleted: deletedSnapshots });
}

// server/routes/admin-questions.ts
import { z as z3 } from "zod";
import { randomUUID as randomUUID3 } from "node:crypto";
init_db();
var questionSchema = z3.object({
  text: z3.string().trim().min(3).max(2e3),
  optionA: z3.string().trim().min(1).max(500),
  optionB: z3.string().trim().min(1).max(500),
  optionC: z3.string().trim().min(1).max(500),
  optionD: z3.string().trim().min(1).max(500),
  correctOption: z3.enum(["A", "B", "C", "D"]),
  isActive: z3.boolean().default(true)
});
async function handleAdminQuestionsList(request, db, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(10, Number(url.searchParams.get("pageSize") ?? "100") || 100)
  );
  const total = await db.execute({ sql: "SELECT COUNT(*) AS n FROM questions", args: [] });
  const rows = await db.execute({
    sql: "SELECT id, text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at, updated_at FROM questions ORDER BY created_at ASC LIMIT ? OFFSET ?",
    args: [pageSize, (page - 1) * pageSize]
  });
  return json({
    total: Number(total.rows[0]?.n ?? 0),
    page,
    pageSize,
    rows: rows.rows.map((r) => ({
      id: String(r.id),
      text: String(r.text),
      optionA: String(r.option_a),
      optionB: String(r.option_b),
      optionC: String(r.option_c),
      optionD: String(r.option_d),
      correctOption: String(r.correct_option),
      isActive: Number(r.is_active) === 1,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at)
    }))
  });
}
async function handleAdminQuestionCreate(request, db, env) {
  await requireAdmin(request, env);
  const body = await readJson(request, questionSchema);
  if (await hasAttemptInProgress(db)) {
    throw new ApiError(
      409,
      "exam_in_progress",
      "Questions cannot be changed while an exam is in progress."
    );
  }
  const id = randomUUID3();
  const now = nowSec();
  await db.execute({
    sql: "INSERT INTO questions (id, text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      id,
      body.text,
      body.optionA,
      body.optionB,
      body.optionC,
      body.optionD,
      body.correctOption,
      body.isActive ? 1 : 0,
      now,
      now
    ]
  });
  return json({ ok: true, id });
}

// server/routes/admin-questions-import.ts
import { z as z4 } from "zod";
import Papa from "papaparse";
import { randomUUID as randomUUID4 } from "node:crypto";
init_db();
var schema3 = z4.discriminatedUnion("action", [
  z4.object({ action: z4.literal("validate"), csv: z4.string().min(1).max(2e6) }),
  z4.object({
    action: z4.literal("commit"),
    csv: z4.string().min(1).max(2e6),
    importMode: z4.enum(["append", "replace_all"])
  })
]);
function parseQuestionsCsv(csv) {
  const parsed = Papa.parse(csv.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase()
  });
  const errors = [];
  const required = ["question", "option_a", "option_b", "option_c", "option_d", "correct"];
  const fields = parsed.meta?.fields ?? [];
  for (const col of required) {
    if (!fields.includes(col)) {
      errors.push({ row: 1, message: `Missing required column "${col}".` });
    }
  }
  if (errors.length > 0) return { rows: [], errors };
  const rows = [];
  parsed.data.forEach((data, i) => {
    const rowNumber = i + 2;
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
    if (text && a && b && c && d && (correct === "A" || correct === "B" || correct === "C" || correct === "D")) {
      rows.push({
        row: rowNumber,
        text,
        optionA: a,
        optionB: b,
        optionC: c,
        optionD: d,
        correctOption: correct
      });
    }
  });
  return { rows, errors };
}
async function handleAdminQuestionsImport(request, db, env) {
  await requireAdmin(request, env);
  const body = await readJson(request, schema3);
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
        "Questions cannot be replaced while an exam is in progress."
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
      "Questions cannot be added while an exam is in progress."
    );
  }
  const now = nowSec();
  for (const row of rows) {
    await db.execute({
      sql: "INSERT INTO questions (id, text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      args: [
        randomUUID4(),
        row.text,
        row.optionA,
        row.optionB,
        row.optionC,
        row.optionD,
        row.correctOption,
        now,
        now
      ]
    });
  }
  return json({ ok: true, inserted: rows.length, importMode: body.importMode });
}

// server/routes/admin-question-item.ts
init_db();
async function handleAdminQuestionUpdate(request, db, env, questionId) {
  await requireAdmin(request, env);
  if (await hasAttemptInProgress(db)) {
    throw new ApiError(
      409,
      "exam_in_progress",
      "Questions cannot be changed while an exam is in progress."
    );
  }
  const body = await readJson(request, questionSchema.partial());
  const existing = await db.execute({
    sql: "SELECT id FROM questions WHERE id = ?",
    args: [questionId]
  });
  if (existing.rows.length === 0) throw new ApiError(404, "not_found", "Question not found.");
  const sets = [];
  const args = [];
  if (body.text !== void 0) {
    sets.push("text = ?");
    args.push(body.text);
  }
  if (body.optionA !== void 0) {
    sets.push("option_a = ?");
    args.push(body.optionA);
  }
  if (body.optionB !== void 0) {
    sets.push("option_b = ?");
    args.push(body.optionB);
  }
  if (body.optionC !== void 0) {
    sets.push("option_c = ?");
    args.push(body.optionC);
  }
  if (body.optionD !== void 0) {
    sets.push("option_d = ?");
    args.push(body.optionD);
  }
  if (body.correctOption !== void 0) {
    sets.push("correct_option = ?");
    args.push(body.correctOption);
  }
  if (body.isActive !== void 0) {
    sets.push("is_active = ?");
    args.push(body.isActive ? 1 : 0);
  }
  if (sets.length === 0) return json({ ok: true });
  sets.push("updated_at = ?");
  args.push(nowSec());
  args.push(questionId);
  await db.execute({ sql: `UPDATE questions SET ${sets.join(", ")} WHERE id = ?`, args });
  return json({ ok: true });
}
async function handleAdminQuestionDelete(request, db, env, questionId) {
  await requireAdmin(request, env);
  if (await hasAttemptInProgress(db)) {
    throw new ApiError(
      409,
      "exam_in_progress",
      "Questions cannot be changed while an exam is in progress."
    );
  }
  const result = await db.execute({
    sql: "DELETE FROM questions WHERE id = ?",
    args: [questionId]
  });
  if (result.rowsAffected === 0) throw new ApiError(404, "not_found", "Question not found.");
  return json({ ok: true });
}

// server/entrypoints/admin/[...path].ts
function parsePath(url) {
  return new URL(url).pathname.split("/").filter(Boolean).slice(2);
}
var path_default = adapter(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  const { env, db } = await makeContext();
  const parts = parsePath(request.url);
  const sub = parts[0] ?? "";
  switch (sub) {
    case "login":
      return handleAdminLogin(request, db, env);
    case "logout":
      return handleAdminLogout(request, db, env);
    case "session":
      return handleAdminSession(request, db, env);
    case "stats":
      return handleAdminStats(request, db, env);
    case "export":
      return handleAdminExport(request, db, env);
    case "settings":
      return handleAdminSettingsUpdate(request, db, env);
    case "reset-all":
      return handleAdminResetAll(request, db, env);
    case "participants": {
      const id = parts[1] ? decodeURIComponent(parts[1]) : null;
      if (!id) return handleAdminParticipants(request, db, env);
      if (parts[2] === "reset") return handleAdminReset(request, db, env, id);
      return handleAdminParticipantDetail(request, db, env, id);
    }
    case "questions": {
      const id = parts[1] ? decodeURIComponent(parts[1]) : null;
      if (parts[1] === "import") return handleAdminQuestionsImport(request, db, env);
      if (!id) {
        if (request.method === "POST") return handleAdminQuestionCreate(request, db, env);
        return handleAdminQuestionsList(request, db, env);
      }
      if (request.method === "DELETE") return handleAdminQuestionDelete(request, db, env, id);
      return handleAdminQuestionUpdate(request, db, env, id);
    }
    default:
      return Promise.resolve(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
  }
});
export {
  path_default as default
};
