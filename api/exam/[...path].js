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
async function readJson(request, schema6) {
  let raw;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "bad_json", "Request body must be valid JSON.");
  }
  const result = schema6.safeParse(raw);
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

// server/routes/exam-start.ts
import { z } from "zod";
import { nanoid } from "nanoid";
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

// server/auth.ts
import { SignJWT, jwtVerify } from "jose";
var PARTICIPANT_COOKIE = "tq_participant";
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
function participantSetCookie(request, env, token) {
  return buildSetCookie(PARTICIPANT_COOKIE, token, {
    maxAgeSec: PARTICIPANT_MAX_AGE,
    secure: isSecureRequest(request)
  });
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
function ensureAttemptSession(attempt, claims) {
  if (attempt && attempt.session_id !== claims.sid) {
    throw new ApiError(
      401,
      "session_replaced",
      "This attempt was opened in another tab or device. That session is now active."
    );
  }
}

// server/shuffle.ts
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}
function secureRandomInt(maxExclusive) {
  const limit = Math.floor(4294967295 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}
var OPTION_KEYS = ["A", "B", "C", "D"];
function buildQuestionOrder(questions) {
  return shuffle(questions.map((q) => ({ qid: q.id, options: shuffle([...OPTION_KEYS]) })));
}

// server/routes/exam-start.ts
var schema = z.object({}).optional();
function ipOf(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}
function uaOf(request) {
  return request.headers.get("user-agent") ?? "";
}
async function handleExamStart(request, db, env) {
  await readJson(request, schema);
  const claims = await requireParticipantClaims(request, env);
  const now = nowSec();
  const settings = await getSettings(db);
  const participantRows = await db.execute({
    sql: "SELECT id, name, terms_accepted_at, camera_consent_at FROM participants WHERE id = ?",
    args: [claims.sub]
  });
  const participant = participantRows.rows[0];
  if (!participant) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  if (participant.terms_accepted_at == null || participant.camera_consent_at == null) {
    throw new ApiError(403, "terms_required", "Terms and camera consent must be accepted first.");
  }
  if (!settings.examOpen) {
    throw new ApiError(403, "exam_closed", "The exam is not open right now.");
  }
  const activeRows = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: []
  });
  if (Number(activeRows.rows[0]?.n ?? 0) !== settings.questionCount) {
    throw new ApiError(
      403,
      "questions_incomplete",
      `The exam requires exactly ${settings.questionCount} active questions.`
    );
  }
  const existing = await getAttemptByParticipant(db, claims.sub);
  const freshExisting = existing ? await ensureNotExpired(db, existing, now, settings) : null;
  if (freshExisting?.status === "submitted") {
    throw new ApiError(
      409,
      "already_submitted",
      "This email has already been used to complete the exam."
    );
  }
  let attempt = freshExisting;
  const resumed = attempt != null;
  if (attempt) {
    const sid2 = nanoid();
    await db.execute({
      sql: "UPDATE attempts SET session_id = ?, ip_address = COALESCE(ip_address, ?), user_agent = COALESCE(user_agent, ?) WHERE id = ?",
      args: [sid2, ipOf(request), uaOf(request), attempt.id]
    });
    const token2 = await signToken(env.sessionSecret, { sub: claims.sub, sid: sid2 }, PARTICIPANT_MAX_AGE);
    attempt = await getAttemptById(db, attempt.id);
    attempt = attempt ? { ...attempt, session_id: sid2 } : attempt;
    return respondWithExam(db, env, request, claims.sub, attempt, resumed, settings, token2);
  }
  const startedAt = now;
  const endsAt = startedAt + settings.durationMinutes * 60;
  const activeQuestions = await db.execute({
    sql: "SELECT id FROM questions WHERE is_active = 1",
    args: []
  });
  const order = buildQuestionOrder(activeQuestions.rows.map((r) => ({ id: String(r.id) })));
  const attemptId = nanoid();
  const sid = nanoid();
  await db.execute({
    sql: `INSERT INTO attempts (id, participant_id, status, started_at, ends_at, question_order, session_id, violation_count, ip_address, user_agent)
          VALUES (?, ?, 'in_progress', ?, ?, ?, ?, 0, ?, ?)`,
    args: [
      attemptId,
      claims.sub,
      startedAt,
      endsAt,
      JSON.stringify(order),
      sid,
      ipOf(request),
      uaOf(request)
    ]
  });
  attempt = await getAttemptById(db, attemptId);
  const token = await signToken(env.sessionSecret, { sub: claims.sub, sid }, PARTICIPANT_MAX_AGE);
  return respondWithExam(db, env, request, claims.sub, attempt, false, settings, token);
}
async function respondWithExam(db, env, request, participantId, attempt, resumed, settings, token) {
  if (!attempt) throw new ApiError(500, "internal", "Could not load the attempt.");
  const order = parseQuestionOrder(attempt.question_order);
  const questions = [];
  for (const entry of order) {
    const q = await db.execute({
      sql: "SELECT id, text, option_a, option_b, option_c, option_d FROM questions WHERE id = ? AND is_active = 1",
      args: [entry.qid]
    });
    const row = q.rows[0];
    if (!row) continue;
    const all = {
      A: String(row.option_a),
      B: String(row.option_b),
      C: String(row.option_c),
      D: String(row.option_d)
    };
    questions.push({
      id: String(row.id),
      text: String(row.text),
      options: entry.options.map((key2) => ({ key: key2, text: all[key2] }))
    });
  }
  const answered = {};
  const answerRows = await db.execute({
    sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
    args: [attempt.id]
  });
  for (const row of answerRows.rows) {
    answered[String(row.question_id)] = row.selected_option == null ? null : String(row.selected_option);
  }
  const now = nowSec();
  return json(
    {
      serverTime: Date.now(),
      endsAt: attempt.ends_at,
      remainingSeconds: Math.max(0, attempt.ends_at - now),
      resume: resumed,
      maxViolations: settings.maxViolations,
      snapshotIntervalSeconds: settings.snapshotIntervalSeconds,
      questions,
      answered,
      violations: attempt.violation_count
    },
    { headers: { "set-cookie": participantSetCookie(request, env, token) } }
  );
}

// server/routes/exam-status.ts
init_db();
async function handleExamStatus(request, db, env) {
  const claims = await requireParticipantClaims(request, env);
  const settings = await getSettings(db);
  const participantRows = await db.execute({
    sql: "SELECT terms_accepted_at, camera_consent_at, terms_version FROM participants WHERE id = ?",
    args: [claims.sub]
  });
  const participant = participantRows.rows[0];
  if (!participant) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  const attempt = attemptRow ? await ensureNotExpired(db, attemptRow, void 0, settings) : null;
  const activeCount = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM questions WHERE is_active = 1",
    args: []
  });
  const activeQuestionCount = Number(activeCount.rows[0]?.n ?? 0);
  const answers = {};
  if (attempt) {
    const rows = await db.execute({
      sql: "SELECT question_id, selected_option FROM answers WHERE attempt_id = ?",
      args: [attempt.id]
    });
    for (const row of rows.rows) {
      answers[String(row.question_id)] = row.selected_option == null ? null : String(row.selected_option);
    }
  }
  const order = attempt ? parseQuestionOrder(attempt.question_order) : [];
  return json({
    serverTime: Date.now(),
    examOpen: settings.examOpen,
    activeQuestionCount,
    settings: {
      durationMinutes: settings.durationMinutes,
      questionCount: settings.questionCount,
      maxViolations: settings.maxViolations,
      snapshotIntervalSeconds: settings.snapshotIntervalSeconds
    },
    terms: {
      accepted: participant.terms_accepted_at != null,
      cameraConsent: participant.camera_consent_at != null,
      version: participant.terms_version == null ? null : String(participant.terms_version)
    },
    attempt: attempt ? {
      status: attempt.status,
      submitReason: attempt.submit_reason,
      startedAt: attempt.started_at,
      endsAt: attempt.ends_at,
      submittedAt: attempt.submitted_at,
      remainingSeconds: Math.max(0, attempt.ends_at - Math.floor(Date.now() / 1e3)),
      violations: attempt.violation_count,
      questionIds: order.map((o) => o.qid),
      answers
    } : null
  });
}

// server/routes/exam-answer.ts
import { z as z2 } from "zod";
init_db();
var schema2 = z2.object({
  questionId: z2.string().min(1),
  selectedOption: z2.enum(["A", "B", "C", "D"]).nullable()
});
async function handleExamAnswer(request, db, env) {
  const body = await readJson(request, schema2);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const now = nowSec();
  const attempt = await ensureNotExpired(db, attemptRow, now, settings);
  if (attempt.status !== "in_progress") {
    throw new ApiError(409, "already_submitted", "This attempt has already been submitted.");
  }
  if (now > attempt.ends_at + GRACE_SECONDS) {
    throw new ApiError(403, "exam_ended", "The exam time is over.");
  }
  const order = parseQuestionOrder(attempt.question_order);
  if (!order.some((o) => o.qid === body.questionId)) {
    throw new ApiError(400, "unknown_question", "This question is not part of your exam.");
  }
  await db.execute({
    sql: `INSERT INTO answers (attempt_id, question_id, selected_option, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(attempt_id, question_id)
          DO UPDATE SET selected_option = excluded.selected_option, updated_at = excluded.updated_at`,
    args: [attempt.id, body.questionId, body.selectedOption, now]
  });
  const countRows = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM answers WHERE attempt_id = ? AND selected_option IS NOT NULL",
    args: [attempt.id]
  });
  return json({ ok: true, answeredCount: Number(countRows.rows[0]?.n ?? 0) });
}
async function handleExamHeartbeat(request, db, env) {
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const attempt = await ensureNotExpired(db, attemptRow, void 0, settings);
  return json({
    serverTime: Date.now(),
    status: attempt.status,
    remainingSeconds: Math.max(0, attempt.ends_at - nowSec()),
    violations: attempt.violation_count
  });
}

// server/routes/exam-submit.ts
import { z as z3 } from "zod";
init_db();
var schema3 = z3.object({
  reason: z3.enum(["manual"]).default("manual")
});
async function handleExamSubmit(request, db, env) {
  const body = await readJson(request, schema3);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const now = nowSec();
  const attempt = await ensureNotExpired(db, attemptRow, now, settings);
  if (attempt.status === "submitted") {
    return json({ status: "submitted", submitReason: attempt.submit_reason });
  }
  let reason = body.reason ?? "manual";
  if (now > attempt.ends_at + GRACE_SECONDS) {
    reason = "time_up";
    const finalized2 = await finalizeAttempt(
      db,
      attempt.id,
      reason,
      Math.max(now, attempt.ends_at),
      settings
    );
    return json({ status: "submitted", submitReason: finalized2.submit_reason });
  }
  const finalized = await finalizeAttempt(db, attempt.id, reason, now, settings);
  return json({ status: "submitted", submitReason: finalized.submit_reason });
}

// server/routes/exam-snapshot.ts
import { z as z4 } from "zod";
init_db();
var MAX_IMAGE_BYTES = 256 * 1024;
var schema4 = z4.object({
  image: z4.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "image must be a base64 JPEG data URL"),
  faceCount: z4.number().int().min(0).max(16).nullable().default(null),
  kind: z4.enum(["periodic", "violation"])
});
async function handleExamSnapshot(request, db, env) {
  const body = await readJson(request, schema4);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const attempt = await ensureNotExpired(db, attemptRow, void 0, settings);
  if (attempt.status !== "in_progress") {
    throw new ApiError(409, "already_submitted", "This attempt has already been submitted.");
  }
  const base64 = body.image.slice(body.image.indexOf(",") + 1);
  const bytes = Math.floor(base64.length * 3 / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "image_too_large", "Snapshot must be under 256 KB.");
  }
  if (!env.blobToken) {
    console.warn("[snapshot] BLOB_READ_WRITE_TOKEN not set \u2014 snapshot skipped");
    return json({ ok: true, stored: false });
  }
  const { put } = await import("@vercel/blob");
  const blob = await put(`snapshots/${attempt.id}/${Date.now()}-${body.kind}.jpg`, base64, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/jpeg",
    token: env.blobToken
  });
  await db.execute({
    sql: "INSERT INTO snapshots (id, attempt_id, blob_url, kind, face_count, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      crypto.randomUUID(),
      attempt.id,
      blob.url,
      body.kind,
      body.faceCount,
      Math.floor(Date.now() / 1e3)
    ]
  });
  return json({ ok: true, stored: true });
}

// server/routes/exam-violation.ts
import { z as z5 } from "zod";
init_db();

// server/violations.ts
var VIOLATION_TYPES = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "no_face",
  "multiple_faces",
  "camera_lost",
  "devtools",
  "other"
];
var BURST_WINDOW_MS = 1500;
var SAME_TYPE_WINDOW_MS = 5e3;
function shouldCountViolation(prev, nowMs) {
  if (prev.lastAnyAtMs !== null && nowMs - prev.lastAnyAtMs < BURST_WINDOW_MS) return false;
  if (prev.lastSameTypeAtMs !== null && nowMs - prev.lastSameTypeAtMs < SAME_TYPE_WINDOW_MS)
    return false;
  return true;
}
function isAutoSubmit(count, maxViolations) {
  return count >= maxViolations;
}

// server/routes/exam-violation.ts
var schema5 = z5.object({
  type: z5.enum(VIOLATION_TYPES),
  meta: z5.record(z5.unknown()).optional()
});
async function handleExamViolation(request, db, env) {
  const body = await readJson(request, schema5);
  const claims = await requireParticipantClaims(request, env);
  const attemptRow = await getAttemptByParticipant(db, claims.sub);
  ensureAttemptSession(attemptRow, claims);
  if (!attemptRow) throw new ApiError(401, "unauthorized", "Please log in to continue.");
  const settings = await getSettings(db);
  const attempt = await ensureNotExpired(db, attemptRow, void 0, settings);
  if (attempt.status !== "in_progress") {
    return json({ count: attempt.violation_count, autoSubmitted: false });
  }
  const nowMs = Date.now();
  const count = await recordViolation(db, attempt, body.type, nowMs, body.meta, settings);
  if (isAutoSubmit(count, settings.maxViolations)) {
    await finalizeAttempt(db, attempt.id, "violations", nowSec(), settings);
    return json({ count, autoSubmitted: true });
  }
  return json({ count, autoSubmitted: false });
}
async function recordViolation(db, attempt, type, nowMs, meta, settingsOverride) {
  const prevAny = await db.execute({
    sql: "SELECT occurred_at FROM violations WHERE attempt_id = ? ORDER BY occurred_at DESC LIMIT 1",
    args: [attempt.id]
  });
  const prevSame = await db.execute({
    sql: "SELECT occurred_at FROM violations WHERE attempt_id = ? AND type = ? ORDER BY occurred_at DESC LIMIT 1",
    args: [attempt.id, type]
  });
  const lastAnyAtMs = prevAny.rows[0] ? Number(prevAny.rows[0].occurred_at) : null;
  const lastSameTypeAtMs = prevSame.rows[0] ? Number(prevSame.rows[0].occurred_at) : null;
  if (!shouldCountViolation({ lastAnyAtMs, lastSameTypeAtMs }, nowMs)) {
    return attempt.violation_count;
  }
  await db.execute({
    sql: "INSERT INTO violations (id, attempt_id, type, occurred_at, meta) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), attempt.id, type, nowMs, meta ? JSON.stringify(meta) : null]
  });
  await db.execute({
    sql: "UPDATE attempts SET violation_count = violation_count + 1 WHERE id = ?",
    args: [attempt.id]
  });
  const fresh = await db.execute({
    sql: "SELECT * FROM attempts WHERE id = ?",
    args: [attempt.id]
  });
  return fresh.rows[0] ? mapAttempt(fresh.rows[0]).violation_count : attempt.violation_count + 1;
}

// server/entrypoints/exam/[...path].ts
function getSubpath(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts[2] ?? "";
}
var path_default = adapter(async (request) => {
  const { env, db } = await makeContext();
  const sub = getSubpath(request.url);
  switch (sub) {
    case "start":
      return handleExamStart(request, db, env);
    case "status":
      return handleExamStatus(request, db, env);
    case "answer":
      return handleExamAnswer(request, db, env);
    case "submit":
      return handleExamSubmit(request, db, env);
    case "heartbeat":
      return handleExamHeartbeat(request, db, env);
    case "snapshot":
      return handleExamSnapshot(request, db, env);
    case "violation":
      return handleExamViolation(request, db, env);
    default:
      return Promise.resolve(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
  }
});
export {
  path_default as default
};
