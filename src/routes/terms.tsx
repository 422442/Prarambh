import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TERMS } from "@/lib/quiz-data";
import { acceptTerms, getSession, startOrResume } from "@/lib/quiz-store";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Prarambh" },
      {
        name: "description",
        content: "Exam rules, marking scheme and consent for the Prarambh entrance exam.",
      },
      { property: "og:title", content: "Terms & Conditions — Prarambh" },
      {
        property: "og:description",
        content: "Exam rules, marking scheme and consent for the Prarambh entrance exam.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState<boolean[]>(() => TERMS.map(() => false));
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) navigate({ to: "/" });
    else setEmail(session);
  }, [navigate]);

  const allTicked = checked.every(Boolean);

  function toggle(index: number) {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  function start() {
    if (!email || !allTicked) return;
    acceptTerms(email);
    // Go fullscreen and navigate directly to exam
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    startOrResume(email);
    navigate({ to: "/exam" });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-4xl font-bold">Terms &amp; Conditions</h1>
      <p className="mt-3 text-sm text-slate">
        Please review and accept all instructions before starting the exam.
      </p>

      <div className="surface-card mt-8 overflow-hidden">
        <ul>
          {TERMS.map((term, i) => (
            <li key={term} className="border-b border-border last:border-b-0">
              <label className="flex cursor-pointer gap-4 px-6 py-4 hover:bg-secondary/50">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-[var(--color-deep-green)]"
                  checked={checked[i] ?? false}
                  onChange={() => toggle(i)}
                />
                <span className="text-sm leading-relaxed">{term}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={start}
        disabled={!allTicked}
        className="pill-primary mt-8 disabled:cursor-not-allowed disabled:opacity-40 font-semibold"
      >
        Start Exam
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Clicking "Start Exam" begins the 45-minute countdown timer immediately.
      </p>
    </main>
  );
}
