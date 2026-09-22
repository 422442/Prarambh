import { EXAM_CONFIG, QUESTION_BANK, type OptionKey, type Question } from "./quiz-data";

export type Attempt = {
  participantId: string;
  name: string;
  email: string;
  termsAcceptedAt: number | null;
  status: "in_progress" | "submitted";
  submitReason: "manual" | "time_up" | "violations" | null;
  startedAt: number;
  endsAt: number;
  submittedAt: number | null;
  questionOrder: string[];
  answers: Record<string, OptionKey | null>;
  marked: string[];
  violations: Array<{ type: string; at: number }>;
  score: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  timeTakenSeconds: number | null;
};

const KEY = "prarambh.attempts";
const SESSION_KEY = "prarambh.session";

const isBrowser = () => typeof window !== "undefined";

function read(): Record<string, Attempt> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Attempt>;
  } catch {
    return {};
  }
}

function write(all: Record<string, Attempt>) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function listAttempts(): Attempt[] {
  return Object.values(read()).sort((a, b) => b.startedAt - a.startedAt);
}

export function getAttempt(email: string): Attempt | null {
  return read()[normalizeEmail(email)] ?? null;
}

export function saveAttempt(attempt: Attempt) {
  const all = read();
  all[attempt.email] = attempt;
  write(all);
}

export function deleteAttempt(email: string) {
  const all = read();
  delete all[normalizeEmail(email)];
  write(all);
}

export function resetAllExamData() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function setSession(email: string) {
  if (isBrowser()) localStorage.setItem(SESSION_KEY, normalizeEmail(email));
}

const ADMIN_KEY = "prarambh.admin";

export function getSession(): string | null {
  return isBrowser() ? localStorage.getItem(SESSION_KEY) : null;
}

export function clearSession() {
  if (isBrowser()) localStorage.removeItem(SESSION_KEY);
}

export function setAdminSession(on: boolean) {
  if (!isBrowser()) return;
  if (on) localStorage.setItem(ADMIN_KEY, "1");
  else localStorage.removeItem(ADMIN_KEY);
}

export function isAdmin(): boolean {
  return isBrowser() && localStorage.getItem(ADMIN_KEY) === "1";
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function registerParticipant(name: string, email: string): Attempt {
  const normalized = normalizeEmail(email);
  const existing = getAttempt(normalized);
  if (existing) {
    setSession(normalized);
    return existing;
  }
  const attempt: Attempt = {
    participantId: `p-${Date.now().toString(36)}`,
    name: name.trim(),
    email: normalized,
    termsAcceptedAt: null,
    status: "in_progress",
    submitReason: null,
    startedAt: 0,
    endsAt: 0,
    submittedAt: null,
    questionOrder: [],
    answers: {},
    marked: [],
    violations: [],
    score: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    timeTakenSeconds: null,
  };
  saveAttempt(attempt);
  setSession(normalized);
  return attempt;
}

export function acceptTerms(email: string) {
  const attempt = getAttempt(email);
  if (!attempt) return;
  attempt.termsAcceptedAt = Date.now();
  saveAttempt(attempt);
}

export function startOrResume(email: string): Attempt | null {
  const attempt = getAttempt(email);
  if (!attempt) return null;
  if (attempt.status === "submitted") return attempt;
  if (attempt.startedAt === 0) {
    attempt.startedAt = Date.now();
    attempt.endsAt = attempt.startedAt + EXAM_CONFIG.durationMinutes * 60_000;
    attempt.questionOrder = shuffle(QUESTION_BANK.filter((q) => q.isActive).map((q) => q.id));
    saveAttempt(attempt);
  }
  if (Date.now() >= attempt.endsAt) {
    return finalize(email, "time_up");
  }
  return attempt;
}

export function saveAnswer(email: string, questionId: string, option: OptionKey | null) {
  const attempt = getAttempt(email);
  if (!attempt || attempt.status === "submitted") return;
  attempt.answers[questionId] = option;
  saveAttempt(attempt);
}

export function toggleMarked(email: string, questionId: string) {
  const attempt = getAttempt(email);
  if (!attempt) return;
  attempt.marked = attempt.marked.includes(questionId)
    ? attempt.marked.filter((id) => id !== questionId)
    : [...attempt.marked, questionId];
  saveAttempt(attempt);
}

export function recordViolation(
  email: string,
  type: string,
): { count: number; autoSubmitted: boolean } {
  const attempt = getAttempt(email);
  if (!attempt || attempt.status === "submitted") return { count: 0, autoSubmitted: false };
  const now = Date.now();
  const recent = attempt.violations.some((v) => v.type === type && now - v.at < 5000);
  const lastAny = attempt.violations[attempt.violations.length - 1];
  if (recent || (lastAny && now - lastAny.at < 1500)) {
    return { count: attempt.violations.length, autoSubmitted: false };
  }
  attempt.violations.push({ type, at: now });
  saveAttempt(attempt);
  if (attempt.violations.length >= EXAM_CONFIG.maxViolations) {
    finalize(email, "violations");
    return { count: attempt.violations.length, autoSubmitted: true };
  }
  return { count: attempt.violations.length, autoSubmitted: false };
}

export function finalize(email: string, reason: Attempt["submitReason"]): Attempt | null {
  const attempt = getAttempt(email);
  if (!attempt) return null;
  if (attempt.status === "submitted") return attempt;

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const qid of attempt.questionOrder) {
    const selected = attempt.answers[qid] ?? null;
    const question = QUESTION_BANK.find((q) => q.id === qid);
    if (!selected) unanswered++;
    else if (question && selected === question.correct) correct++;
    else wrong++;
  }

  attempt.status = "submitted";
  attempt.submitReason = reason;
  attempt.submittedAt = Math.min(Date.now(), attempt.endsAt);
  attempt.correctCount = correct;
  attempt.wrongCount = wrong;
  attempt.unansweredCount = unanswered;
  attempt.score = correct * EXAM_CONFIG.marksCorrect + wrong * EXAM_CONFIG.marksWrong;
  attempt.timeTakenSeconds = Math.max(
    0,
    Math.round((attempt.submittedAt - attempt.startedAt) / 1000),
  );
  saveAttempt(attempt);
  return attempt;
}

export function questionById(id: string): Question | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
