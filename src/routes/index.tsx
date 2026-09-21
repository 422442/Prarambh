import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { registerParticipant, normalizeEmail, getAttempt } from "@/lib/quiz-store";
import { useUserAgent } from "@/hooks/use-user-agent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prarambh — Register" },
      { name: "description", content: "Register with your name and email to take the 45-minute, 60-question Prarambh entrance exam." },
      { property: "og:title", content: "Prarambh — Register" },
      { property: "og:description", content: "Register with your name and email to take the 45-minute, 60-question Prarambh entrance exam." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isDesktop } = useUserAgent();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDesktop) {
      return navigate({ to: "/blocked" });
    }
    const cleanName = name.trim();
    const cleanEmail = normalizeEmail(email);
    if (cleanName.length < 2) return setError("Please enter your full name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return setError("Please enter a valid email address.");

    const existing = getAttempt(cleanEmail);
    if (existing?.status === "submitted") {
      registerParticipant(cleanName, cleanEmail);
      return navigate({ to: "/submitted" });
    }
    const attempt = registerParticipant(cleanName, cleanEmail);
    navigate({ to: attempt.termsAcceptedAt ? "/exam" : "/terms" });
  }

  // Redirect mobile/tablet users to blocked page
  if (!isDesktop) {
    navigate({ to: "/blocked" });
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="mono-label font-bold tracking-wider">PRARAMBH</span>
      </header>

      <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-16">
        <h1 className="text-center text-5xl">Prarambh</h1>
        <p className="mt-4 max-w-md text-center text-sm text-slate">
          Enter your details to begin. You may attempt the exam only once with your email address.
        </p>

        <form onSubmit={onSubmit} className="surface-card mt-10 w-full p-7">
          <label className="mono-label block text-slate" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            className="field-input mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="A. Sharma"
          />

          <label className="mono-label mt-6 block text-slate" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field-input mt-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            placeholder="you@example.com"
          />

          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="pill-primary mt-7 w-full hover:opacity-90">
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}
