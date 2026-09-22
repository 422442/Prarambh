# Tech Quiz Entrance Exam Platform: Project Documentation

**Version:** 1.0 (planning)
**Stack:** Next.js (App Router) · Turso (libSQL) · Vercel (hosting, Blob, Cron)
**Design system:** Cohere (`DESIGN-cohere.md`)

---

## 1. Overview

A web-based entrance exam for a tech quiz. Participants register with a name and email, accept the terms and conditions, and take a timed 60-question exam while being monitored. Admins log in to a separate panel to manage questions and view every participant's score, time taken and monitoring evidence.

### 1.1 Confirmed requirements

| Area | Decision |
|---|---|
| Participant login | Name + Email (no OTP) |
| Attempts | One attempt per email; resume allowed after refresh/disconnect |
| Terms & Conditions | Must be accepted (all checkboxes) before the exam can start |
| Duration | 45 minutes, countdown shown on screen, auto-submit at 00:00 |
| Questions | 60 multiple-choice questions (4 options, one correct) |
| Marking | +2 per correct answer, −0.5 per wrong answer, 0 for unanswered |
| Maximum marks | 60 × 2 = **120** |
| Violations | Auto-submit on the **3rd** violation |
| Monitoring | Fullscreen lock, tab-switch detection, copy/paste/right-click block, periodic webcam snapshots, face detection alerts |
| Result to participant | Only a "Submitted successfully" message (no score shown) |
| Admin panel | Email + password login; view all participants, marks, time taken, monitoring evidence |
| Question management | Admin panel add/edit + CSV upload |
| Database | Turso |
| Deployment | Vercel |

### 1.2 Assumptions (change any of these if wrong)

1. Unanswered questions score 0 (no penalty).
2. The total score is **not** clamped at 0 (a participant answering mostly wrong can score below 0). This is a single config flag.
3. Questions and their options are shuffled per participant. The order is fixed at start and stored, so resume shows the same order.
4. Ranking is by **score (high to low)**, then **time taken (low to high)** as the tie-breaker.
5. There is a single admin account, seeded from environment variables. Multiple admins can be added later.
6. The exam is desktop/laptop only (a camera and fullscreen are required). Phones and tablets are blocked with a friendly message.
7. Webcam snapshots are stored in **Vercel Blob**; Turso stores only the URL and metadata.

---

## 2. User Flows

### 2.1 Participant

```
Landing / Login (Name + Email)
        │
        ▼
Terms & Conditions (must tick all + camera consent)
        │
        ▼
System check (fullscreen supported, camera permission, face visible)
        │
        ▼
Start Exam ──► 45:00 countdown, 60 questions, monitoring active
        │
        ├── Refresh / disconnect ──► Login again with same email ──► resumes with remaining time
        │
        ├── 3rd violation ──► auto-submit
        ├── Timer hits 00:00 ──► auto-submit
        └── Participant clicks Submit (with confirmation)
        │
        ▼
"Submitted successfully" screen (no score shown)
```

### 2.2 Admin

```
Admin Login (email + password)
        │
        ├── Dashboard (stats)
        ├── Participants (table, search, sort, export CSV)
        │        └── Participant detail (answers, violations, snapshots)
        ├── Questions (list, add/edit/delete, CSV upload)
        └── Settings (open/close exam, retention, reset attempt)
```

---

## 3. Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────┐
│  Browser (participant)       │        │  Vercel                  │
│  - React UI                  │  HTTPS │  - Next.js pages         │
│  - Fullscreen / visibility   │◄──────►│  - Route Handlers (API)  │
│  - MediaPipe face detection  │        │  - Cron (backup sweeper) │
│  - Webcam snapshots          │        └───────┬──────────┬───────┘
└──────────────────────────────┘                │          │
                                                ▼          ▼
                                        ┌────────────┐  ┌─────────────┐
                                        │   Turso    │  │ Vercel Blob │
                                        │ (libSQL DB)│  │ (snapshots) │
                                        └────────────┘  └─────────────┘
```

### 3.1 Recommended tech

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS with Cohere design tokens |
| DB client | `@libsql/client` (optionally Drizzle ORM for typed queries and migrations) |
| Validation | `zod` |
| Sessions | Signed HttpOnly cookies using `jose` (JWT) |
| Password hashing | `bcryptjs` |
| CSV parsing | `papaparse` |
| Face detection | `@mediapipe/tasks-vision` (runs fully in the browser) |
| Snapshot storage | `@vercel/blob` |

### 3.2 Core design principles

1. **The server owns the clock.** `ends_at` is computed and stored on the server when the exam starts. The browser only displays a countdown derived from server time. Changing the device clock cannot extend the exam.
2. **The server owns the answers key.** `correct_option` is never sent to the browser. Scoring happens only on the server.
3. **Answers autosave.** Every selection is saved to the DB immediately (debounced). This makes resume work and lets abandoned attempts still be graded.
4. **Submission is idempotent.** Submitting twice (timer + violation at the same instant) yields one result.

---

## 4. Database Design (Turso / SQLite)

### 4.1 Tables

```sql
-- Admin accounts
CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL          -- unix seconds
);

-- Participants (one row per email)
CREATE TABLE participants (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE, -- stored lowercased and trimmed
  terms_version     TEXT,
  terms_accepted_at INTEGER,
  camera_consent_at INTEGER,
  created_at        INTEGER NOT NULL
);

-- Question bank
CREATE TABLE questions (
  id             TEXT PRIMARY KEY,
  text           TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT NOT NULL,
  option_d       TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- One attempt per participant
CREATE TABLE attempts (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL UNIQUE REFERENCES participants(id),
  status             TEXT NOT NULL CHECK (status IN ('in_progress','submitted')),
  submit_reason      TEXT CHECK (submit_reason IN ('manual','time_up','violations','admin')),
  started_at         INTEGER NOT NULL,
  ends_at            INTEGER NOT NULL,     -- started_at + 45 * 60
  submitted_at       INTEGER,
  question_order     TEXT NOT NULL,        -- JSON: [{ "qid": "...", "options": ["C","A","D","B"] }, ...]
  score              REAL,
  correct_count      INTEGER,
  wrong_count        INTEGER,
  unanswered_count   INTEGER,
  time_taken_seconds INTEGER,              -- submitted_at - started_at
  violation_count    INTEGER NOT NULL DEFAULT 0,
  ip_address         TEXT,
  user_agent         TEXT
);

-- Saved answers (upserted on every selection)
CREATE TABLE answers (
  attempt_id      TEXT NOT NULL REFERENCES attempts(id),
  question_id     TEXT NOT NULL REFERENCES questions(id),
  selected_option TEXT CHECK (selected_option IN ('A','B','C','D')),
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

-- Monitoring violations
CREATE TABLE violations (
  id          TEXT PRIMARY KEY,
  attempt_id  TEXT NOT NULL REFERENCES attempts(id),
  type        TEXT NOT NULL CHECK (type IN
                ('tab_switch','window_blur','fullscreen_exit','no_face',
                 'multiple_faces','camera_lost','devtools','other')),
  occurred_at INTEGER NOT NULL,
  meta        TEXT                          -- JSON, optional details
);

-- Webcam snapshots (image lives in Vercel Blob)
CREATE TABLE snapshots (
  id         TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  blob_url   TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('periodic','violation')),
  face_count INTEGER,
  taken_at   INTEGER NOT NULL
);

-- Exam-wide settings
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Seed values:
-- exam_open=1, duration_minutes=45, question_count=60, marks_correct=2,
-- marks_wrong=-0.5, max_violations=3, clamp_score_at_zero=0,
-- snapshot_interval_seconds=45, snapshot_retention_days=30

CREATE INDEX idx_attempts_status ON attempts(status);
CREATE INDEX idx_violations_attempt ON violations(attempt_id);
CREATE INDEX idx_snapshots_attempt ON snapshots(attempt_id);
```

### 4.2 Scoring formula

```
score = (correct_count × 2) − (wrong_count × 0.5)
```
Unanswered contribute 0. Maximum possible score is 120.

---

## 5. Exam Logic in Detail

### 5.1 Starting the exam

1. Verify the exam is open (`settings.exam_open = 1`) and there are exactly 60 active questions.
2. Verify the participant accepted the terms and camera consent.
3. If an attempt already exists:
   - `in_progress` and `now < ends_at`: **resume** with the same question order and remaining time.
   - `submitted`, or `now ≥ ends_at`: finalize if needed, then show "already submitted".
4. Otherwise create the attempt: `started_at = now`, `ends_at = now + 2700s`, and a shuffled `question_order`.

### 5.2 Timer and auto-submit

- **Client:** shows `mm:ss` counting down from `ends_at − serverNow` (a server-time offset is fetched on load and re-synced every 60 s).
- At `00:00` the client calls `POST /api/exam/submit` with reason `time_up`.
- **Server enforcement:** the answer-save and submit endpoints accept requests only until `ends_at + 10s` (grace for network latency). After that, the attempt is finalized from the answers already saved.
- **Safety nets (in this order):**
  1. *Lazy finalization:* any request touching an attempt with `now > ends_at` and `status = in_progress` finalizes it. The admin participants list runs this check too.
  2. *Cron sweeper:* a Vercel Cron job finalizes any expired in-progress attempts. On the Vercel Hobby plan cron frequency is limited, so lazy finalization is the primary mechanism and cron is a backup.

### 5.3 Resume behaviour

Because the clock is server-side, closing the browser does **not** pause the timer. On return, the participant logs in with the same email and sees the remaining time and their saved answers. Violation count and snapshot history persist.

### 5.4 Exam screen features

- Question card (one at a time) with 4 options.
- Question palette (grid of 1–60) showing: answered, not answered, marked for review, current.
- Previous / Next, Mark for review, Clear response.
- Persistent timer (turns coral under 5 minutes).
- Violation counter banner, for example "Warning 1 of 3".
- Submit button with a confirmation dialog showing counts of answered, unanswered and marked questions.

---

## 6. Monitoring & Proctoring

> Browser-based proctoring is a **deterrent plus evidence trail**, not an unbreakable lock. A determined participant with a second device can still cheat. The design therefore records evidence for admin review rather than pretending to be perfect.

### 6.1 Detection matrix

| Signal | How it's detected | Counts as violation? |
|---|---|---|
| Tab switch | `document.visibilitychange` → hidden | Yes |
| Window loses focus | `window.blur` (debounced, ignores camera prompts) | Yes |
| Exit fullscreen | `fullscreenchange` | Yes |
| No face in frame | MediaPipe Face Detector, ~1 check/second, no face for ≥ 5 s | Yes |
| Multiple faces | Face count ≥ 2 sustained for ≥ 3 s | Yes |
| Camera stopped/blocked | `MediaStreamTrack` `ended`/`mute` events | Yes |
| Copy / paste / cut / right-click | Event blocked | No (blocked, logged only) |
| Blocked shortcuts (F12, Ctrl+Shift+I, Ctrl+U, PrintScreen, etc.) | `keydown` intercepted | Logged only |
| Page refresh / reload | `beforeunload` warning | No (resume is allowed) |

### 6.2 Violation rules

- **3 violations → auto-submit** (`submit_reason = 'violations'`).
- **Debounce:** the same type is counted at most once per 5 seconds, and simultaneous events caused by one action (for example, leaving fullscreen also fires blur) count as **one** violation. This avoids unfair double-counting.
- Every violation is written to the `violations` table server-side, and the server (not the browser) decides when the 3rd one triggers submission. The client only reports events.
- On each violation, a snapshot is captured (`kind = 'violation'`).

### 6.3 Webcam snapshots

- Camera permission is required to begin. A pre-exam **system check** confirms the camera works and exactly one face is visible.
- A snapshot is taken every ~45 seconds (with randomised jitter of ±10 s) and on every violation.
- Images are downscaled (about 320×240 JPEG, ~15–25 KB) and uploaded to Vercel Blob; a row is written to `snapshots`.
- Estimated storage: ~60 snapshots × ~20 KB ≈ **1.2 MB per participant**.
- Snapshots are auto-deleted after the retention period (default 30 days, configurable).
- Face detection runs **locally in the browser**; no video is streamed to any server.

### 6.4 Environment restrictions

- Requires a desktop browser with the Fullscreen API and camera access (latest Chrome, Edge, Firefox; Safari best-effort).
- Mobile/tablet user agents are shown a "please use a laptop or desktop" message.
- Only one active session per attempt: a second login from another device invalidates the first session.

### 6.5 Recommended admin review

The participant detail page shows a violation timeline and snapshot gallery, so the admin can review flagged attempts manually. A "flagged" badge appears for any attempt with at least 1 violation.

---

## 7. API Design

All routes are Next.js Route Handlers. Participant routes require the participant session cookie; admin routes require the admin cookie.

### 7.1 Participant

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Body `{ name, email }`. Creates/finds participant, sets session cookie |
| POST | `/api/terms/accept` | Records terms version, timestamps, camera consent |
| GET | `/api/exam/status` | Exam open?, attempt state, server time |
| POST | `/api/exam/start` | Creates or resumes attempt; returns questions (**without** correct answers), `ends_at` |
| POST | `/api/exam/answer` | Body `{ questionId, selectedOption \| null }`. Upserts an answer |
| POST | `/api/exam/violation` | Body `{ type, meta }`. Logs it; returns `{ count, autoSubmitted }` |
| POST | `/api/exam/snapshot` | Uploads a snapshot (image + face_count + kind) |
| POST | `/api/exam/submit` | Body `{ reason }`. Idempotent finalization and scoring |

### 7.2 Admin

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/admin/login` | Email + password, sets admin cookie |
| POST | `/api/admin/logout` | Clears cookie |
| GET | `/api/admin/stats` | Dashboard numbers |
| GET | `/api/admin/participants` | Paginated, searchable, sortable list |
| GET | `/api/admin/participants/:id` | Detail: answers, violations, snapshots |
| GET | `/api/admin/export` | CSV export of results |
| POST | `/api/admin/participants/:id/reset` | Delete attempt so they can retake (audit-logged) |
| GET/POST | `/api/admin/questions` | List / create |
| PUT/DELETE | `/api/admin/questions/:id` | Edit / delete |
| POST | `/api/admin/questions/import` | CSV upload (validate, preview, then commit) |
| PUT | `/api/admin/settings` | Open/close exam, retention, etc. |
| GET | `/api/cron/finalize` | Cron sweeper (protected by `CRON_SECRET`) |

### 7.3 Question CSV format

```csv
question,option_a,option_b,option_c,option_d,correct
"What does HTML stand for?","HyperText Markup Language","High Text Machine Language","HyperTool Multi Language","Home Tool Markup Language",A
```

Import rules:
- Header row required; `correct` must be `A`, `B`, `C` or `D`.
- The upload shows a **preview** with per-row validation errors before anything is saved.
- Options: **Append** or **Replace all**. Replace is blocked once any attempt exists.
- The exam cannot be opened unless there are exactly 60 active questions.

---

## 8. Security

| Risk | Mitigation |
|---|---|
| Answer key leakage | `correct_option` never leaves the server; scoring is server-side |
| Clock tampering | Server-authoritative `ends_at` |
| Admin brute force | Rate limiting on `/api/admin/login`; bcrypt hashes; generic error messages |
| Session theft | HttpOnly, Secure, SameSite=Lax cookies; short-lived JWTs |
| SQL injection | Parameterised queries only (libSQL/Drizzle) |
| Admin routes exposed | Middleware protects `/admin/*` and `/api/admin/*` |
| Duplicate submission | Idempotent submit; unique constraint on `participant_id` in `attempts` |
| Snapshot privacy | Consent captured in terms; access only via admin; retention auto-delete |
| Email impersonation | **Known limitation:** without OTP, someone who knows another person's email could resume that attempt. Mitigations: single active session, IP/user-agent logged and shown to admin, admin can reset. An OTP step can be added later without changing the schema |

---

## 9. UI / UX Design (based on the Cohere design system)

### 9.1 Design tokens used

| Token | Value | Used for |
|---|---|---|
| `canvas` | `#ffffff` | Default page background |
| `primary` | `#17171c` | Primary pill buttons, dark cards |
| `ink` | `#212121` | Body text |
| `deep-green` | `#003c33` | Exam header bar and dark feature bands |
| `soft-stone` | `#eeece7` | Stat cards, question palette background |
| `pale-green` | `#edfce9` | "Answered" state, success surfaces |
| `hairline` | `#d9d9dd` | Table rules, input borders |
| `muted` / `slate` | `#93939f` / `#75758a` | Metadata, timestamps |
| `coral` | `#ff7759` | Small warm accents only: timer under 5 min, violation warnings, "flagged" chips |
| `action-blue` | `#1863dc` | Links, pagination |
| `form-focus` | `#9b60aa` | Text input focus border |
| `focus-blue` | `#4c6ee6` | Keyboard focus ring |
| `error` | `#b30000` | Validation errors |

**Typography** (Cohere fonts are proprietary and not bundled, so the documented fallbacks apply):
- Display: `Space Grotesk` (fallback `Inter`), weight 400, tight line-height and negative tracking.
- UI/Body: `Inter` (fallback Arial / system-ui).
- Technical labels and the **timer**: monospace with uppercase 14px labels (`mono-label` role).

**Shape:** 22px radius on major cards, 8px on smaller cards and dialogs, 4px on inputs, 32px pill on primary buttons, 30px on outline pills. **No heavy shadows**; depth comes from surface contrast and 1px hairlines.

### 9.2 Screens

**Participant**

| Screen | Layout |
|---|---|
| **Login** | Centered display headline ("Tech Quiz Entrance") on white; a `contact-form-card` (22px radius, 1px hairline) with Name and Email fields; near-black pill "Continue" button. Announcement bar (black, 36px) above the nav shows exam date/instructions |
| **Terms & Conditions** | Rule-separated list of terms (research-table style), one checkbox per group, a camera-consent checkbox, "Start system check" pill disabled until all are ticked |
| **System check** | Camera preview in a 22px rounded card, status rows with checkmarks (camera, face detected, fullscreen supported), primary pill "Start exam" |
| **Exam** | Deep-green top bar (`#003c33`) with the mono timer on the right and violation counter; main white question card; right-side palette grid (60 numbered squares: pale-green = answered, hairline outline = unanswered, coral outline = marked for review, black fill = current). Mobile: palette collapses into a drawer |
| **Submitted** | Minimal centered message "Submitted successfully" with a secondary text link. No score is displayed |
| **Blocked / closed** | Friendly messages for "exam not open", "already submitted", "use desktop" |

**Admin**

| Screen | Layout |
|---|---|
| **Admin login** | Same card style as participant login, on `soft-stone` background |
| **Dashboard** | Row of `soft-stone` stat cards: registered, in progress, submitted, average score, average time, flagged count |
| **Participants** | Full-width `research-table`: Rank, Name, Email, Status, Score /120, Correct, Wrong, Unanswered, Time taken (mm:ss), Violations, Submitted at. Search field, outline-pill filters (Status, Flagged), sortable columns, pagination, "Export CSV" |
| **Participant detail** | Summary header, per-question answer review (chosen vs correct), violation timeline, snapshot gallery in rounded 8px thumbnails with lightbox, "Reset attempt" in a danger area |
| **Questions** | Table with an "x / 60 active" indicator, add/edit modal, CSV upload with preview step |
| **Settings** | Open/close exam toggle, snapshot retention, danger zone |

### 9.3 Responsiveness

Follows the Cohere breakpoints: single-column below 640px, two-column from 768px, full layouts from 1024px. The exam itself is desktop-only, but the admin panel is responsive (tables scroll horizontally on small screens).

### 9.4 Accessibility

Keyboard-navigable exam (arrow keys for options where possible, `N`/`P` for next/previous), visible focus rings, sufficient contrast, screen-reader labels on the timer and palette, and `aria-live` announcements for violation warnings.

---

## 10. Project Structure

```
/app
  /(participant)
    page.tsx                  # login
    terms/page.tsx
    check/page.tsx
    exam/page.tsx
    submitted/page.tsx
  /admin
    login/page.tsx
    page.tsx                  # dashboard
    participants/page.tsx
    participants/[id]/page.tsx
    questions/page.tsx
    settings/page.tsx
  /api/...                    # route handlers from section 7
/components
  /exam   (Timer, QuestionCard, Palette, ViolationBanner, WebcamMonitor)
  /admin  (StatCard, ParticipantsTable, CsvImport, SnapshotGallery)
  /ui     (Button, Input, Card, Chip, Dialog)
/lib
  db.ts                       # Turso client
  schema.ts                   # Drizzle schema (optional)
  auth.ts                     # session + admin auth
  scoring.ts
  exam.ts                     # start/resume/finalize logic
  monitoring.ts               # client-side detectors
middleware.ts                 # protects /admin and /api/admin
```

---

## 11. Environment Variables

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `SESSION_SECRET` | Random 32+ byte string for signing cookies |
| `ADMIN_EMAIL` | Seed admin email |
| `ADMIN_PASSWORD` | Seed admin password (hashed on first seed; remove afterwards) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access |
| `CRON_SECRET` | Protects the cron endpoint |

---

## 12. Deployment (Vercel + Turso)

1. **Create the database**
   ```bash
   turso db create tech-quiz
   turso db show tech-quiz --url
   turso db tokens create tech-quiz
   ```
2. **Run migrations** (execute the SQL from section 4 or use Drizzle Kit) and seed the settings and the admin user.
3. **Push code to GitHub** and import the repo in Vercel.
4. **Add environment variables** (section 11) in Vercel → Project Settings.
5. **Enable Vercel Blob** for the project (creates `BLOB_READ_WRITE_TOKEN`).
6. **Add the cron job** in `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/cron/finalize", "schedule": "0 * * * *" }] }
   ```
   (Schedule granularity depends on your Vercel plan.)
7. **Deploy**, then log in to `/admin/login`, upload the 60 questions, and open the exam.
8. **Load test** before exam day (section 14).

> Use a dedicated Turso database for production and a separate one for testing. Turso offers point-in-time recovery and branching on supported plans, so take a backup before exam day.

---

## 13. Edge Cases

| Situation | Behaviour |
|---|---|
| Same email registers twice | Returns the existing participant; resumes or shows "already submitted" |
| Name differs on second login | Original name kept; admin sees a mismatch note |
| Browser closed mid-exam | Timer keeps running; resume on return with saved answers |
| Internet drops | Client queues answer saves and retries; a banner shows "reconnecting". The server finalizes at `ends_at` regardless |
| Timer hits 0 while offline | The server auto-finalizes via lazy finalization or cron using saved answers |
| Two tabs open | Newest session wins; the older tab is logged out and gets a message |
| Camera permission revoked | Counts as a violation; the participant is asked to re-enable |
| Fewer than 60 active questions | Exam cannot be opened; the admin sees a warning |
| Admin edits questions during a live exam | Blocked while any attempt is `in_progress` |
| Participant submits early | Confirmation dialog, then instant submit |
| Device clock is changed | No effect; the server clock is used |

---

## 14. Testing Plan

**Functional:** register, terms gate, start, answer, refresh and resume, manual submit, timer auto-submit, violation auto-submit at exactly 3, and score correctness against a hand-computed sample (for example 40 correct + 15 wrong + 5 unanswered = 80 − 7.5 = **72.5**).

**Monitoring:** tab switch, fullscreen exit, blur, no face, two faces, camera unplug; verify debounce (one action equals one violation).

**Security:** the network tab must never show `correct_option`; admin routes return 401 without a cookie; the answer endpoint rejects requests after `ends_at + grace`.

**Load:** simulate the expected number of concurrent participants for answer saves and snapshot uploads (a k6 or Artillery script is recommended).

**Cross-browser:** Chrome, Edge, Firefox on Windows/macOS; Safari best-effort.

---

## 15. Implementation Roadmap

| Phase | Deliverables |
|---|---|
| **1. Foundation** | Next.js project, Tailwind + Cohere tokens, Turso connection, schema, seed script |
| **2. Participant core** | Login, terms, session, start/resume, question UI, autosave, timer, submit and scoring |
| **3. Admin core** | Admin login, questions CRUD + CSV import, participants table, CSV export, dashboard |
| **4. Monitoring** | Fullscreen/visibility/blur detection, violation logging, 3-strike auto-submit, system check |
| **5. Webcam** | MediaPipe face detection, snapshot capture/upload to Blob, admin gallery |
| **6. Hardening** | Rate limiting, cron sweeper, retention cleanup, edge cases, accessibility, load test |
| **7. Launch** | Production deploy, dry run with test participants, backup |

---

## 16. Future Enhancements

- OTP email verification to remove the impersonation risk.
- Multiple admin accounts with roles.
- Question sections/categories and per-category analytics.
- Release results later to participants (email or portal).
- Live admin view of participants currently taking the exam.
- Screen recording or second-camera proctoring for high-stakes rounds.

---

## Appendix A: Draft Terms & Conditions (edit before use)

1. I will complete this exam on my own without help from any person, website, AI tool, or device.
2. The exam lasts **45 minutes** and contains **60 questions**. The timer starts when I click "Start Exam" and cannot be paused, even if I close the browser.
3. Each correct answer earns **2 marks**. Each wrong answer deducts **0.5 marks**. Unanswered questions earn 0.
4. The exam will be **submitted automatically** when the timer reaches 00:00.
5. The exam must be taken in **fullscreen**. Switching tabs, switching windows, or exiting fullscreen counts as a violation.
6. Having no face visible, or more than one person visible, in the camera counts as a violation.
7. On the **3rd violation**, my exam will be submitted automatically.
8. Copying, pasting, right-clicking and developer-tool shortcuts are disabled.
9. I consent to the use of my **webcam**. Periodic photos will be captured and stored for exam-integrity review and deleted after the retention period.
10. I may attempt the exam **only once** with my email address.
11. Results will be shared by the organisers; the score is not shown after submission.
12. Cheating or attempting to bypass the monitoring may lead to **disqualification**.
13. I confirm that the name and email I entered are correct and belong to me.

---

## Appendix B: Sample Result Row (admin view)

| Rank | Name | Email | Score /120 | Correct | Wrong | Unanswered | Time taken | Violations | Reason |
|---:|---|---|---:|---:|---:|---:|---|---:|---|
| 1 | A. Sharma | a@example.com | 72.5 | 40 | 15 | 5 | 38:12 | 0 | manual |
| 2 | R. Singh | r@example.com | 72.5 | 40 | 15 | 5 | 43:50 | 1 | time_up |
