import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { clearSession } from "@/lib/quiz-store";

export const Route = createFileRoute("/submitted")({
  head: () => ({
    meta: [
      { title: "Submitted — Prarambh" },
      { name: "description", content: "Your Prarambh entrance exam has been submitted. Results will be shared by the organisers." },
      { property: "og:title", content: "Submitted — Prarambh" },
      { property: "og:description", content: "Your Prarambh entrance exam has been submitted. Results will be shared by the organisers." },
    ],
  }),
  component: SubmittedPage,
});

function SubmittedPage() {
  useEffect(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    clearSession();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="mono-label text-deep-green">Step 3 of 3</span>
      <h1 className="mt-4 text-5xl">Submitted successfully</h1>
      <p className="mt-4 max-w-md text-sm text-slate">
        Your responses have been recorded. Results will be shared by the organisers — your score is not shown here.
      </p>
      <Link to="/" className="mt-8 text-sm text-action hover:underline">
        Back to start
      </Link>
    </main>
  );
}
