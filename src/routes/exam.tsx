import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAM_CONFIG, type OptionKey } from "@/lib/quiz-data";
import {
  finalize,
  formatDuration,
  getSession,
  questionById,
  recordViolation,
  saveAnswer,
  startOrResume,
  type Attempt,
} from "@/lib/quiz-store";
import { Watermark } from "@/components/Watermark";
import { playSirenSound, getRandomFunnyMessage } from "@/lib/siren";

export const Route = createFileRoute("/exam")({
  head: () => ({
    meta: [
      { title: "Exam in progress — Prarambh" },
      { name: "description", content: "60 multiple-choice questions in 45 minutes. Answers save automatically." },
      { property: "og:title", content: "Exam in progress — Prarambh" },
      { property: "og:description", content: "60 multiple-choice questions in 45 minutes. Answers save automatically." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExamPage,
});

const LETTERS: OptionKey[] = ["A", "B", "C", "D"];

interface ViolationModalState {
  message: string;
  label: string;
  count: number;
  max: number;
  autoSubmitted: boolean;
}

function ExamPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [violationModal, setViolationModal] = useState<ViolationModalState | null>(null);

  const stopSirenRef = useRef<(() => void) | null>(null);

  const submitExam = useCallback(
    (reason: "manual" | "time_up" | "violations") => {
      if (stopSirenRef.current) {
        stopSirenRef.current();
        stopSirenRef.current = null;
      }
      const session = getSession();
      if (!session) return;
      finalize(session, reason);
      navigate({ to: "/submitted" });
    },
    [navigate],
  );

  useEffect(() => {
    const session = getSession();
    if (!session) {
      navigate({ to: "/" });
      return;
    }
    const current = startOrResume(session);
    if (!current || current.status === "submitted") {
      navigate({ to: "/submitted" });
      return;
    }
    setEmail(session);
    setAttempt(current);
    const firstUnanswered = current.questionOrder.findIndex((id) => !current.answers[id]);
    setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
  }, [navigate]);

  useEffect(() => {
    if (!attempt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((attempt.endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) submitExam("time_up");
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attempt, submitExam]);

  // Anti-cheating monitoring — fires loud siren alarm & displays Hinglish funny message
  useEffect(() => {
    if (!email) return;

    const flag = (type: string, label: string) => {
      const { count, autoSubmitted } = recordViolation(email, type);
      if (count === 0) return;

      if (stopSirenRef.current) {
        stopSirenRef.current();
      }
      stopSirenRef.current = playSirenSound(5);

      setViolationModal({
        message: getRandomFunnyMessage(),
        label,
        count,
        max: EXAM_CONFIG.maxViolations,
        autoSubmitted,
      });

      setAttempt((prev) =>
        prev ? { ...prev, violations: [...prev.violations, { type, at: Date.now() }] } : prev,
      );
    };

    const onVisibility = () => {
      if (document.hidden) flag("tab_switch", "You left the exam tab");
    };
    const onBlur = () => flag("window_blur", "The exam window lost focus");
    const onFullscreen = () => {
      if (!document.fullscreenElement) flag("fullscreen_exit", "You exited fullscreen mode");
    };
    const block = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    document.addEventListener("cut", block);

    return () => {
      if (stopSirenRef.current) stopSirenRef.current();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("cut", block);
    };
  }, [email]);

  const counts = useMemo(() => {
    if (!attempt) return { answered: 0, unanswered: 0 };
    const answered = attempt.questionOrder.filter((id) => attempt.answers[id]).length;
    return {
      answered,
      unanswered: attempt.questionOrder.length - answered,
    };
  }, [attempt]);

  function dismissViolationModal() {
    if (stopSirenRef.current) {
      stopSirenRef.current();
      stopSirenRef.current = null;
    }
    const autoSub = violationModal?.autoSubmitted;
    setViolationModal(null);
    if (autoSub) {
      submitExam("violations");
    } else {
      // Re-enter fullscreen mode after acknowledging violation
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          // Ignore errors if fullscreen is not available or denied
        });
      }
    }
  }

  if (!attempt || !email) return null;

  const totalQ = attempt.questionOrder.length;
  const isLastQuestion = totalQ > 0 && index === totalQ - 1;

  const questionId = totalQ > 0 ? attempt.questionOrder[index] ?? "" : "";
  const question = questionId ? questionById(questionId) : undefined;
  const selected = questionId ? attempt.answers[questionId] ?? null : null;
  const lowTime = remaining <= 300;

  function select(option: OptionKey | null) {
    if (!questionId) return;
    saveAnswer(email!, questionId, option);
    setAttempt((prev) => (prev ? { ...prev, answers: { ...prev.answers, [questionId]: option } } : prev));
  }

  return (
    <div className="relative min-h-screen bg-background">
      <Watermark />

      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-deep-green px-6 py-4 text-deep-green-foreground shadow-md">
        <span className="mono-label text-base font-bold tracking-wider">PRARAMBH</span>

        <div className="flex items-center gap-4 sm:gap-6">
          {/* Violations */}
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs">
            <span className="mono-label text-[11px] text-white/80">Violations:</span>
            <span
              className={`font-mono font-semibold ${
                attempt.violations.length > 0 ? "text-coral" : "text-white"
              }`}
            >
              {attempt.violations.length}/{EXAM_CONFIG.maxViolations}
            </span>
          </div>

          {/* Timer */}
          <span
            className={`font-mono text-2xl font-semibold tracking-tight ${
              lowTime ? "animate-pulse text-coral" : "text-white"
            }`}
            aria-live="polite"
            aria-label="Time remaining"
          >
            {formatDuration(remaining)}
          </span>

          {/* 3-line palette button */}
          <button
            type="button"
            onClick={() => setPaletteOpen((prev) => !prev)}
            className="group flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 transition hover:bg-white/25"
            aria-label="Question Palette"
            title="Question Palette"
          >
            <div className="flex flex-col items-center gap-1.5 w-5">
              <span className="h-0.5 w-5 rounded-full bg-white" />
              <span className="h-0.5 w-5 rounded-full bg-white" />
              <span className="h-0.5 w-5 rounded-full bg-white" />
            </div>
          </button>
        </div>
      </header>

      {/* Question Card */}
      <main className="relative z-20 mx-auto w-full max-w-5xl px-4 sm:px-8 py-8">
        {totalQ === 0 ? (
          <section className="surface-card p-10 text-center shadow-sm border border-border/80 bg-card/95">
            <h2 className="text-2xl font-semibold text-foreground">No questions found</h2>
            <p className="mt-3 text-sm text-slate">
              Question bank is currently empty. Please wait for organizers to upload the official exam questions.
            </p>
          </section>
        ) : (
          <section className="surface-card p-6 sm:p-10 shadow-sm border border-border/80 bg-card/95">
            {/* Question header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <span className="mono-label font-medium text-slate">
                Question {index + 1} of {totalQ}
              </span>
              <div className="flex items-center gap-2 text-xs">
                {selected ? (
                  <span className="rounded-full bg-pale-green px-3 py-1 font-medium text-deep-green">
                    Answered ({selected})
                  </span>
                ) : (
                  <span className="rounded-full bg-secondary px-3 py-1 text-slate">
                    Not answered
                  </span>
                )}
              </div>
            </div>

            <h1 className="mt-6 text-xl sm:text-2xl font-normal leading-relaxed text-foreground">
              {question?.text}
            </h1>

            {/* Options */}
            <div className="mt-8 space-y-3.5">
              {LETTERS.map((letter) => {
                const active = selected === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => select(letter)}
                    className={
                      active
                        ? "flex w-full items-start gap-4 rounded-xl border-2 border-deep-green bg-pale-green/90 p-4 sm:p-5 text-left transition shadow-sm"
                        : "flex w-full items-start gap-4 rounded-xl border border-border/90 bg-card p-4 sm:p-5 text-left transition hover:border-deep-green/50 hover:bg-secondary/50"
                    }
                  >
                    <span
                      className={
                        active
                          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-deep-green text-xs font-semibold text-deep-green-foreground"
                          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-semibold text-slate"
                      }
                    >
                      {letter}
                    </span>
                    <span className="text-sm sm:text-base text-foreground leading-relaxed pt-0.5">
                      {question?.options[letter]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Navigation: Only Previous, Next, and Submit on Last Question */}
            <div className="mt-10 flex items-center justify-between border-t border-border/60 pt-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="pill-outline hover:bg-secondary font-medium px-5 py-2.5"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="pill-outline hover:bg-secondary font-medium px-5 py-2.5"
                  onClick={() => setIndex((i) => Math.min(totalQ - 1, i + 1))}
                  disabled={isLastQuestion}
                >
                  Next
                </button>
              </div>

              {/* Submit button — ONLY on last question */}
              {isLastQuestion && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="pill-primary flex items-center gap-2 font-semibold shadow-lg px-6 py-2.5 transition hover:scale-105 active:scale-95"
                >
                  <span>Submit Exam</span>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                    {counts.answered}/{totalQ}
                  </span>
                </button>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Palette Drawer */}
      {paletteOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setPaletteOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed top-0 right-0 z-50 flex h-full w-80 max-w-[90vw] flex-col border-l border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Question Palette</h2>
                <span className="mono-label text-xs text-slate">
                  {counts.answered} of {totalQ} answered
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate hover:bg-secondary"
                aria-label="Close palette"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-6 gap-2">
                {attempt.questionOrder.map((id, i) => {
                  const answered = !!attempt.answers[id];
                  const current = i === index;
                  const cls = current
                    ? "bg-primary text-primary-foreground border-primary font-bold shadow-sm"
                    : answered
                      ? "bg-pale-green border-pale-green text-deep-green font-medium"
                      : "border-border bg-card text-slate hover:border-slate/50";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setIndex(i);
                        setPaletteOpen(false);
                      }}
                      className={`h-9 rounded-md border text-xs transition ${cls}`}
                      aria-label={`Go to Q${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 border-t border-border pt-5 space-y-2 text-xs text-slate">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-pale-green border border-deep-green" />
                    Answered
                  </span>
                  <span className="font-mono font-medium text-foreground">{counts.answered}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full border border-border bg-card" />
                    Not answered
                  </span>
                  <span className="font-mono font-medium text-foreground">{counts.unanswered}</span>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Violation Warning Modal — Funny Message in Hinglish, UI Controls in English */}
      {violationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-8 shadow-2xl text-center">
            {/* Strike bar */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[...Array(violationModal.max)].map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < violationModal.count ? "bg-coral" : "bg-border"
                  }`}
                />
              ))}
            </div>

            <p className="mono-label text-xs text-coral mb-2">
              Warning {violationModal.count} of {violationModal.max}
            </p>

            {/* Funny Cheating Message in Hinglish */}
            <h2 className="text-xl font-semibold text-foreground leading-snug">
              {violationModal.message}
            </h2>

            <p className="mt-3 text-xs text-slate">{violationModal.label}</p>

            {violationModal.autoSubmitted && (
              <p className="mt-4 text-sm font-semibold text-coral">
                Maximum violation limit reached. Your exam is being automatically submitted.
              </p>
            )}

            <button
              type="button"
              onClick={dismissViolationModal}
              className="pill-primary mt-6 w-full py-3 font-semibold"
            >
              I understand, return to exam
            </button>
          </div>
        </div>
      )}

      {/* Submit Confirmation Dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-foreground">Submit your exam?</h2>
            <p className="mt-3 text-sm text-slate leading-relaxed">
              {counts.answered} answered · {counts.unanswered} unanswered.
              This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="pill-outline hover:bg-secondary font-medium"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pill-primary font-medium"
                onClick={() => submitExam("manual")}
              >
                Submit Exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
