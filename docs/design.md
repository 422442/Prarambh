# Tech Quiz Entrance — Design

Companion to `docs/requirements.md`. Implements `docs/TECH-QUIZ-ENTRANCE-DOCUMENTATION.md` §4–§12 with the prompt's overrides.

## 1. Architecture

```
Browser (SPA — TanStack Router, React Query)
  participant pages: / /terms /check /exam /submitted /blocked
  admin pages:       /admin/login /admin /admin/participants(/:id) /admin/questions /admin/settings
        │  fetch same-origin, cookie auth, JSON
        ▼
Vercel  /api/*.ts serverless functions (Node runtime, thin adapters)
        /api/_core/* shared server core (routing excluded)  ──►  Turso (libSQL)   Vercel Blob
Crons:  /api/cron/finalize (hourly)  /api/cron/cleanup (daily)   (CRON_SECRET)
```

- **SPA switch:** TanStack Start `spa` mode → `vite build` emits static `dist/` (index.html + assets). `vercel.json` rewrites all non-`/api` GETs to `/index.html`. `vercel dev` serves SPA + functions together. `src/server.ts` SSR wrapper stays but is unused at runtime.
- **Function adapter pattern:** each `/api` file is ≤ 20 lines: parse Vercel request → build Web `Request` → call a pure `handle*(ctx)` core in `/api/_core` → map Web `Response` back. This makes every handler unit/integration-testable with plain `Request`/`Response`.
- **Client:** `src/lib/api.ts` typed client (fetch, JSON, `ApiError{status,code,message}`, same-origin cookies). React Query for admin pages; plain state for exam page (its needs are real-time, not cache-shaped).

## 2. Database (Turso/libSQL) — `migrations/0001_init.sql`

All timestamps are unix **seconds** (INTEGER). IDs are 22-char random (`nanoid`-style via `crypto`).

```sql
CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,            -- bcryptjs
  created_at INTEGER NOT NULL
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,             -- trimmed + lowercased
  last_login_name TEXT,                   -- C6: name-mismatch note
  terms_version TEXT,
  terms_accepted_at INTEGER,
  camera_consent_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE REFERENCES participants(id),
  status TEXT NOT NULL CHECK (status IN ('in_progress','submitted')),
  submit_reason TEXT CHECK (submit_reason IN ('manual','time_up','violations','admin')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  submitted_at INTEGER,
  question_order TEXT NOT NULL,           -- JSON: [{qid, options:["C","A","D","B"]}, ...]
  session_id TEXT NOT NULL,               -- C4: single active session
  score REAL, correct_count INTEGER, wrong_count INTEGER, unanswered_count INTEGER,
  time_taken_seconds INTEGER,
  violation_count INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT, user_agent TEXT
);

CREATE TABLE answers (
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  selected_option TEXT CHECK (selected_option IN ('A','B','C','D')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE violations (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  type TEXT NOT NULL CHECK (type IN
    ('tab_switch','window_blur','fullscreen_exit','no_face',
     'multiple_faces','camera_lost','devtools','other')),
  occurred_at INTEGER NOT NULL,           -- ms precision stored as INTEGER ms for debounce
  meta TEXT
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  blob_url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('periodic','violation')),
  face_count INTEGER,
  taken_at INTEGER NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- seed: exam_open=1, duration_minutes=45, question_count=60, marks_correct=2,
-- marks_wrong=-0.5, max_violations=3, clamp_score_at_zero=0,
-- snapshot_interval_seconds=45, snapshot_retention_days=30

CREATE TABLE admin_audit (               -- C5
  id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL,
  target TEXT, detail TEXT, created_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (               -- C5
  id TEXT PRIMARY KEY,                   -- key = sha256(ip:email:window)

## 3. Auth & sessions

- Participant JWT payload `{sub: participantId, sid: sessionId}`, cookie `tq_participant`, Max-Age 12 h. Admin JWT `{sub: adminId, role:"admin"}`, cookie `tq_admin`, Max-Age 8 h. HS256, `SESSION_SECRET`.
- Every participant handler: verify JWT → load attempt by `participant_id` → check `attempt.session_id === sid` else `401 {code:"session_replaced"}`. `POST /api/auth/register` always rotates `session_id`.
- Cookie flags: HttpOnly, SameSite=Lax, Path=/, Secure unless request is plain-http localhost (enables `vercel dev`).
- Admin guard: verify JWT role=admin else `401 {code:"unauthorized"}`.
- Rate limit: on failed admin login, upsert counter for `sha256(ip|email)` in a 15-min window; ≥ 5 failures → `429` (generic message); success clears.

## 4. API contracts (zod on every body; errors `{error:{code,message}}`)

### Participant (cookie: `tq_participant` unless noted)

| Method & route | Body / query | Success response | Notes |
|---|---|---|---|
| POST `/api/time` (GET) | — | `{serverTime}` (ms) | clock sync |
| POST `/api/auth/register` | `{name≥2, email:email}` | `{status:"new"\|"resuming"\|"submitted", participant:{name}, examOpen}` | rotates session; sets cookie; 403 `exam_closed` only when new participant |
| POST `/api/terms/accept` | `{termsVersion}` | `{ok:true}` | 401 if no session; stores version + both timestamps |
| GET `/api/exam/status` | — | `{serverTime, examOpen, activeQuestionCount, settings:{durationMinutes,maxViolations,snapshotIntervalSeconds}, attempt:{status,startedAt,endsAt,submittedAt,remainingSeconds,violations, answers:{qid:"A"...}} \| null, terms:{accepted,cameraConsent,version}}` | runs lazy finalize |
| POST `/api/exam/start` | — | `{serverTime, endsAt, remainingSeconds, questions:[{id,text,options:[{key:"C",text}...] }], answered:{qid:key}, resume:boolean}` | creates/resumes; 403 `exam_closed` / `questions_incomplete`; NO correct_option |
| POST `/api/exam/answer` | `{questionId, selectedOption:"A".."D"\|null}` | `{ok:true, answeredCount}` | 403 `exam_ended` after `ends_at+10s` (lazy-finalizes); 401 `session_replaced` |
| POST `/api/exam/violation` | `{type, meta?}` | `{count, autoSubmitted}` | debounce §6; 3rd → finalize |
| POST `/api/exam/snapshot` | `{image:"data:image/jpeg;base64,…", faceCount, kind}` | `{ok:true}` | ≤ 256 KB; Blob put → row |
| POST `/api/exam/submit` | `{reason:"manual"}` | `{status:"submitted"}` | idempotent; no score; grace 10 s then time_up-finalize |
| POST `/api/exam/heartbeat` | — | same as status (light) | resume + reconnect check |

### Admin (cookie: `tq_admin`)

| Method & route | Body / query | Success |
|---|---|---|
| POST `/api/admin/login` | `{email,password}` | `{ok:true}` + cookie; generic 401/429 |
| POST `/api/admin/logout` | — | `{ok:true}` + cookie cleared |
| GET `/api/admin/session` | — | `{authenticated:true, email}` or 401 |
| GET `/api/admin/stats` | — | `{registered,inProgress,submitted,avgScore,avgTimeSeconds,flagged,activeQuestions,examOpen}` |
| GET `/api/admin/participants` | `page,pageSize=20,q,status=all\|registered\|in_progress\|submitted,flagged,sort=name\|email\|score\|time\|submitted_at,dir=asc\|desc` | `{rows:[{rank,name,email,participantId,status,score,correct,wrong,unanswered,timeTakenSeconds,violations,submittedAt,submitReason}],total,page,pageSize}` |
| GET `/api/admin/participants/:id` | — | `{participant, attempt, answers:[{index,text,chosen,correct,result}], violations:[…], snapshots:[…]}` |
| GET `/api/admin/export` | same filters | `text/csv` attachment (rank, name, email, status, score, correct, wrong, unanswered, time, violations, submitted_at, reason) |
| POST `/api/admin/participants/:id/reset` | — | `{ok:true}`; deletes attempt+answers+violations+snapshot rows+blobs; audit row |
| GET/POST `/api/admin/questions` | POST `{text,optionA..D,correct}` | list `{rows,total}` / create `{ok,id}` |

## 5. Core algorithms (`/api/_core`)

**Scoring** (`score.ts`, pure): given ordered question ids + answers + question keys + settings:
`correct/wrong/unanswered` counts; `score = correct*marks_correct + wrong*marks_wrong`; clamp at 0 if `clamp_score_at_zero=1`; `time_taken = min(submitted_at − started_at, duration)`.

**Finalization** (`finalize.ts`): transactional; if already `submitted` → return existing (idempotent). Sets status, reason, submitted_at (`min(now, ends_at)` for time_up), counts, score. Answers already in DB are the source of truth. `submit_reason="admin"` reserved for reset-free admin-forced submits (not used by reset, which deletes).

**Lazy finalization** (`ensureNotExpired`): on any request touching an attempt (status, answer, violation, snapshot, submit, admin list, admin detail): if `status=in_progress && now > ends_at + grace` → finalize with `time_up` and continue with fresh state.

**Violation debounce** (`violations.ts`, pure fn tested):
```

countViolation(prevLastAtMs, prevLastSameTypeAtMs, nowMs, type):
if now − lastAnyAt < 1500 → ignore (one action = one violation)
if type == lastType && now − lastSameTypeAt < 5000 → ignore
else insert violation row, attempt.violation_count += 1
if violation_count >= max_violations → finalize("violations") → {count, autoSubmitted:true}

```
Client mirrors the same rule before reporting (`src/lib/monitoring/report.ts`).

**Question shuffle** (`shuffle.ts`): Fisher–Yates with `crypto.getRandomValues`; order entries `{qid, options:[4 keys]}`; options also shuffled. Resume returns stored order verbatim.

**Shuffled option mapping:** API returns `options:[{key:"C",text},…]` in stored order; client renders in that order; selection posts the original `key`.

## 6. Frontend wiring (files to touch)

| File | Change |
|---|---|
| `src/lib/api.ts` (new) | typed client + `ApiError` |
| `src/lib/constants.ts` (new) | TERMS, CAMERA_CONSENT, TERMS_VERSION (from old quiz-data; no question bank) |
| `src/lib/quiz-store.ts`, `src/lib/quiz-data.ts` | deleted (mocks) |
| `src/routes/index.tsx` | call `auth.register`; navigate by `status`; mobile check → `/blocked`; exam-closed → blocked |
| `src/routes/terms.tsx` | `exam.status` gate + `terms.accept` |
| `src/routes/check.tsx` | `exam.status` gate; add "Face detected" row (reuse face hook); Start → `exam.start` |
| `src/routes/exam.tsx` | server-synced timer (60 s re-sync), debounced autosave + offline retry queue + "reconnecting" banner, violation reporting hooks, webcam + periodic/violation snapshots, auto-submit at 00:00, submit via API |
| `src/routes/submitted.tsx` | clear cookie client-side only (cookie already HttpOnly-expired by server) — keep visual |
| `src/routes/blocked.tsx` (new) | friendly messages: mobile / closed / setup / session-replaced |
| `src/routes/admin.*` | React Query against admin API; 401 → redirect `/admin/login`; reset via API with confirm; snapshot gallery in detail |
| `src/components/admin/AdminShell.tsx` | session check on mount (API), keep visuals |
| `src/hooks/*` (new) | `useExamClock`, `useAutosave`, `useMonitoring` (visibility/blur/fullscreen/copy/shortcuts), `useCameraWatch`, `useFaceDetection`, `useSnapshots` |

New UI is limited to: `/blocked` page, reconnecting banner, snapshot gallery + lightbox, "Face detected" row, minor status text — all using existing tokens/utilities (`surface-card`, `pill-primary`, `mono-label`, coral for warnings).

## 7. Testing

- **Vitest** (node env). `tests/unit/*.test.ts`: scoring (40C+15W+5U = 72.5; clamp flag; unanswered), violation debounce (5 s same-type, 1.5 s burst, 3-strike), idempotent submit, deadline enforcement (+10 s grace), lazy finalization.
- `tests/integration/flow.test.ts`: against a `file:` libSQL DB + fake clock (`ctx.now`) + mocked `@vercel/blob`: register → duplicate email → terms → start (seeded 60) → answer → refresh/resume (new session invalidates old) → manual submit idempotent → participant response contains no `correct_option`; 3-strike auto-submit; time-up finalize; admin 401 without cookie; cron rejects bad secret.
- Helper: `callRoute(core, init)` builds Web `Request` with `Cookie` header.

## 8. Security checklist (each verified by a test)

1. `correct_option` never in participant responses (integration assertion greps JSON).
2. Admin routes → 401 without cookie.
3. All SQL parameterised (code review + no string interpolation in `_core/db.ts`).
4. Answer/submit reject after `ends_at + 10 s`.
5. Cron rejects without `CRON_SECRET`.
6. Rate limit returns generic 429; login errors generic.
7. Session rotation invalidates older tab.

## 9. Env vars

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET` — documented in `.env.example`; Vercel project settings + `.env.local` for `vercel dev`.

| PUT/DELETE `/api/admin/questions/:id` | PUT `{text?,optionA..D?,correct?,isActive?}` | `{ok}`; 409 `exam_in_progress` when blocked |
| POST `/api/admin/questions/import` | step 1 `{action:"validate", csv}` → `{rows:[…],errors:[{row,message}],validCount}`; step 2 `{action:"commit", csv, importMode:"append"\|"replace_all"}` → `{inserted}`; 409 when replace_all blocked | papaparse; header required; correct ∈ A–D |
| PUT `/api/admin/settings` | `{examOpen?, snapshotRetentionDays?, clampScoreAtZero?}` | `{settings}` |

### Cron

- `GET /api/cron/finalize` — `Authorization: Bearer $CRON_SECRET` or `?secret=`; finalizes every expired `in_progress` attempt; `{finalized:n}`.
- `GET /api/cron/cleanup` — same guard; deletes snapshots (Blob `del` + rows) older than retention; `{deleted:n}`.

  bucket TEXT NOT NULL,                  -- 'admin_login'
  window_start INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bucket, id)
);

CREATE INDEX idx_attempts_status ON attempts(status);
CREATE INDEX idx_violations_attempt ON violations(attempt_id);
CREATE INDEX idx_snapshots_attempt ON snapshots(attempt_id);
CREATE INDEX idx_snapshots_taken ON snapshots(taken_at);
```

Migration runner (`scripts/db-migrate.ts`): reads `migrations/*.sql` in order, tracks applied files in `_migrations(name TEXT PRIMARY KEY, applied_at INTEGER)`, applies inside `batch()`. Seed (`scripts/db-seed.ts`): upsert settings, create admin from env (bcrypt hash), idempotent. Both accept `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` or `--file:local.db` for tests/dev.
