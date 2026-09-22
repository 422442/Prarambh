# Tech Quiz Entrance — Requirements

Source of truth: `docs/TECH-QUIZ-ENTRANCE-DOCUMENTATION.md` (the doc's §4–§14).
Conflict rule: **the build prompt wins** over the doc wherever they disagree (noted inline as `[PROMPT]`).
UI is frozen: no redesign, no restyle — only wiring + minimal new UI in existing tokens.

## 0. Conflicts & resolutions

| #   | Doc says                                                                | Resolution                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Stack "Next.js (App Router)"                                            | Repo is **TanStack Start (Vite, file-based TanStack Router)**. Frontend is frozen; backend is Vercel Serverless Functions under `/api` `[PROMPT]`. TanStack Start is switched to **SPA mode** (static build + SPA rewrites in `vercel.json`, `/api` excluded) so the mandated deployment model works. No UI change. |
| C2  | Session cookie via jose JWT                                             | Confirmed `[PROMPT]`: two separate sessions (participant, admin), HttpOnly+Secure+SameSite=Lax, bcryptjs for admin passwords.                                                                                                                                                                                       |
| C3  | Question order stored as JSON `[{qid, options:[…]}]`                    | Confirmed `[PROMPT]`: questions **and options** shuffled per participant at start; order stored in `attempts.question_order`; answers always use **original option keys A–D**.                                                                                                                                      |
| C4  | Doc has no `session_id` on attempts                                     | Added (prompt mandates single-active-session).                                                                                                                                                                                                                                                                      |
| C5  | Doc mentions "audit-logged" reset, rate-limited login without storage   | Added `admin_audit` and `rate_limits` tables (Turso-backed; serverless has no shared memory).                                                                                                                                                                                                                       |
| C6  | Doc edge case "name differs on second login → admin sees mismatch note" | Added `participants.last_login_name`.                                                                                                                                                                                                                                                                               |
| C7  | `DESIGN-cohere.md` referenced but missing                               | `src/styles.css` token block is the style source of truth.                                                                                                                                                                                                                                                          |

## 1. Participant flow

- **FR-1** Login with Name + Email only. Email trimmed + lowercased, unique. One attempt per email. Re-login with the same email resumes or shows "already submitted".
- **FR-2** Duplicate email must NOT error — it returns the existing participant (`resuming` / `submitted`). Name mismatch: original name kept, `last_login_name` updated for the admin note.
- **FR-3** Terms & conditions: every item ticked + camera consent ticked before the exam can start. `POST /api/terms/accept` stores `terms_version` (client constant, currently `"1.0"`) + `terms_accepted_at` + `camera_consent_at` (unix seconds).
- **FR-4** System check page (exists) requires camera permission + fullscreen support + one visible face before "Start exam" is enabled.
- **FR-5** Exam start is allowed only if `settings.exam_open = 1` AND exactly 60 active questions exist; otherwise a friendly blocked page (`/blocked?reason=closed|setup`).
- **FR-6** Start creates the attempt: `started_at = now`, `ends_at = started_at + duration(45min)`, shuffled `question_order` (questions + options). Resume reuses stored order, saved answers, remaining time, violation count.
- **FR-7** Exam UI (existing): one question at a time, 4 shuffled options (original keys A–D), palette 1–60 (answered/not-answered/marked/current), Previous/Next, Mark for review, Clear response, submit dialog with answered/unanswered/marked counts.
- **FR-8** Marked-for-review stays client-side (per prompt; not persisted — resume loses marks, accepted).
- **FR-9** Mobile/tablet UAs are blocked with a friendly message (`/blocked?reason=mobile`).
- **FR-10** After submission the participant sees ONLY "Submitted successfully" — no score, no correct answers, ever.

## 2. Exam engine

- **FR-11** 60 MCQs, 4 options, one correct. 45 minutes. Score = (correct×2) − (wrong×0.5), unanswered 0, max 120. NOT clamped at 0 unless `settings.clamp_score_at_zero = 1`.
- **FR-12** The SERVER owns the clock: `started_at`/`ends_at` stored at start; client only displays a countdown derived from server time (server-time offset endpoint, re-synced every 60 s). Closing the browser never pauses the timer.
- **FR-13** Answers autosave on every selection (upsert, debounced client-side + retry queue when offline with a "reconnecting" banner).
- **FR-14** `correct_option` is NEVER sent to any participant-facing endpoint. Scoring only on the server.
- **FR-15** Save endpoint rejects requests after `ends_at + 10s` grace. Submit rejects (then lazy-finalizes) likewise.
- **FR-16** Submission is idempotent: double submit returns the same result, no double scoring. `time_taken_seconds = submitted_at − started_at` capped at duration. `submit_reason ∈ manual | time_up | violations | admin`.
- **FR-17** Client auto-submits at 00:00 (`time_up`); server also finalizes expired attempts via (a) lazy finalization on any request touching them — including admin list/detail — and (b) Vercel Cron `GET /api/cron/finalize` guarded by `CRON_SECRET`.
- **FR-18** Only one active session per attempt: new login regenerates `attempts.session_id`; older session gets a "session replaced" message.

## 3. Monitoring `[PROMPT]`

- **FR-19** `POST /api/exam/violation {type, meta}`; types: `tab_switch, window_blur, fullscreen_exit, no_face, multiple_faces, camera_lost, devtools, other`. The SERVER counts and decides auto-submit; on the 3rd it finalizes (`submit_reason=violations`) and returns `{count, autoSubmitted}`.
- **FR-20** Debounce (server-authoritative): same type at most once per 5 s; events fired together by one action (e.g. fullscreen-exit + blur within 1.5 s) count as ONE. Mirrored client-side.
- **FR-21** `POST /api/exam/snapshot` receives downscaled JPEG (~320×240, ~20 KB, sent as base64 data URL), `face_count`, `kind ∈ periodic|violation`; uploads to Vercel Blob; stores row (URL + metadata only). Periodic every 45 s ± 10 s jitter; one snapshot on every violation.
- **FR-22** Client hooks: fullscreen enforcement, `visibilitychange`, window blur, copy/paste/cut/contextmenu blocking, blocked shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, PrintScreen — logged only, no violation), `MediaStreamTrack` ended/mute detection, face detection with `@mediapipe/tasks-vision` fully in-browser (no face ≥ 5 s → violation; ≥ 2 faces sustained 3 s → violation; ~1 fps).

## 4. Admin

- **FR-23** Single admin seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` by the seed script (bcrypt hash only). Login rate-limited (Turso counter by IP+email, 5 failures / 15 min) with generic error messages.
- **FR-24** Endpoints: login, logout, session check, stats, participants list, participant detail, CSV export, reset attempt (audit-logged), questions CRUD, questions CSV import (validate → preview → commit; append | replace-all), settings update.
- **FR-25** Participants list columns: rank, name, email, status, score, correct, wrong, unanswered, time taken, violations, submitted_at, submit_reason. Rank = score desc, then time_taken asc. Pagination + search (name/email) + sort + filters (status, flagged).
- **FR-26** Participant detail: answers (chosen vs correct), violation timeline, snapshot gallery (thumbnails + lightbox).
- **FR-27** CSV export of results (same columns as list, global rank).
- **FR-28** Question edits and replace-all imports are **blocked while any attempt is `in_progress`**.
- **FR-29** Question CSV columns: `question,option_a,option_b,option_c,option_d,correct`; header required; `correct ∈ A–D`; per-row validation errors shown in preview.
- **FR-30** Snapshot retention cron deletes blob + rows older than `settings.snapshot_retention_days` (default 30).

## 5. Security

- **FR-31** Admin API routes return 401 without the admin cookie. Participant routes 401 without a valid participant cookie (session id mismatch → 409/401 "session replaced").
- **FR-32** All SQL parameterised. All bodies zod-validated. Generic auth errors.
- **FR-33** Answer/submit reject after deadline + grace; cron rejects without `CRON_SECRET` (Authorization: Bearer or `?secret=`).
- **FR-34** Cookies: signed (jose HS256), HttpOnly, Secure (auto-relaxed on http localhost for `vercel dev`), SameSite=Lax.

## 6. Delivery & ops

- **FR-35** Migrations as plain `.sql` + apply script + seed script (settings + admin). Scripts work against remote Turso (`libsql://`) and local `file:` DBs.
- **FR-36** `vercel.json`: SPA rewrites (excluding `/api`), crons (`/api/cron/finalize` hourly; `/api/cron/cleanup` daily). Local dev with `vercel dev`.
- **FR-37** `.env.example` with: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`.
- **FR-38** Tests: unit (scoring 72.5 case, violation debounce, idempotent submit, deadline enforcement, lazy finalization) + integration (register → terms → start → answer → refresh/resume → manual submit; 3-strike auto-submit; time-up finalization; duplicate email; second-session invalidation; admin 401s).
- **FR-39** README with step-by-step Turso + Vercel deployment instructions.
