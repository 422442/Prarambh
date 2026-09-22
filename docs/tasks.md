# Tech Quiz Entrance — Tasks

Phased per the prompt's order. Each phase ends with `npm run typecheck && npm run lint && npm test` green before moving on.

## Phase 1 — Foundation: DB, db client, tooling, deployment skeleton

- [ ] `npm install` new deps: `@libsql/client`, `jose`, `bcryptjs`, `papaparse`, `@vercel/blob`, `nanoid`; dev: `vitest`, `dotenv`, `@types/papaparse`, `@types/bcryptjs`, `vercel` (CLI)
- [ ] `migrations/0001_init.sql` (schema from design §2) + `scripts/db-migrate.ts` + `scripts/db-seed.ts` + npm scripts `db:migrate` / `db:seed`
- [ ] `/api/_core/db.ts` (client factory, `file:` support for tests, typed settings accessor) + `/api/_core/http.ts` (Web Request/Response adapter, cookie helpers, json/error helpers, zod body parser)
- [ ] `vercel.json` (SPA rewrites excluding `/api`, crons, output dir) + `.env.example`
- [ ] Switch TanStack Start to SPA mode in `vite.config.ts`; verify `npm run build` emits static SPA and `vercel dev` serves it
- [ ] Vitest setup (`vitest.config.ts`, test scripts, tsconfig include `api/**`, `scripts/**`, `tests/**`)

## Phase 2 — Auth + participant flow up to start/resume

- [ ] `/api/_core/auth.ts`: jose sign/verify, participant + admin cookies, session rotation, guards
- [ ] `POST /api/auth/register`, `POST /api/terms/accept`, `GET /api/exam/status`, `GET /api/time` (+ `POST /api/exam/heartbeat`)
- [ ] `POST /api/exam/start` (+ `shuffle.ts`): exam_open + 60-active gate, create/resume, question_order JSON, session rotation
- [ ] `scripts/seed-questions.ts`: load the sample CSV (doc Appendix C format) so the exam can start locally
- [ ] Wire `/`, `/terms`, `/check` to the API (remove quiz-store usage); `/blocked` page; mobile UA guard

## Phase 3 — Answers, timer, submit, scoring, finalization, cron

- [ ] `POST /api/exam/answer` (upsert, grace, lazy finalize), `POST /api/exam/submit` (idempotent), `ensureNotExpired` integrated into status/answer/submit
- [ ] `/api/_core/score.ts` + finalization logic + admin-visible fields
- [ ] `/api/cron/finalize` (CRON_SECRET guard)
- [ ] Exam page: server-synced clock (`useExamClock`, 60 s re-sync), autosave debounce + retry queue + reconnecting banner, auto-submit at 00:00, submit dialog via API, `/submitted` flow

## Phase 4 — Admin API

- [ ] login (bcrypt + rate_limits + generic errors), logout, session check; logout route client wiring
- [ ] stats, participants list (search/sort/filter/pagination/rank), participant detail (answers chosen-vs-correct, violations, snapshots), CSV export, reset attempt (audit + blob cleanup)
- [ ] questions CRUD (+ `exam_in_progress` lock), CSV import (validate → preview → commit, append/replace_all + lock), settings update
- [ ] Admin pages wired with React Query; 401 redirect; dashboard/participants/detail/questions/settings real data; remove printed prototype credentials

## Phase 5 — Monitoring hooks, face detection, snapshots

- [ ] `/api/exam/violation` (+ debounce core) + `/api/exam/snapshot` (Blob upload)
- [ ] Client: `useMonitoring` (visibility, blur, fullscreen, copy/paste/contextmenu, shortcut logging), client-side coalescing, violation banner "Warning N of 3", auto-redirect on autoSubmit
- [ ] `useCameraWatch` (track ended/mute), `useSnapshots` (periodic 45 s ± 10 s jitter + on-violation), `useFaceDetection` (@mediapipe/tasks-vision, 5 s no-face / 3 s multi-face), wire into `/check` (face row) and `/exam`

## Phase 6 — Hardening, retention, README

- [ ] `/api/cron/cleanup` (retention) + second cron entry
- [ ] Security checklist pass (§8) with tests; edge cases: two tabs, camera revoked, name mismatch, fewer-than-60 questions
- [ ] README: Turso + Vercel step-by-step (db create, token, migrate, seed, env vars, Blob, deploy, upload questions, open exam); remove stale mock docs
- [ ] Final: typecheck + lint + full test suite green; build + `vercel dev` smoke test
