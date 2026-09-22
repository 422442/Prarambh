import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getSession, getAttempt, startOrResume } from "@/lib/quiz-store";

export const Route = createFileRoute("/check")({
  head: () => ({
    meta: [{ title: "Starting — Prarambh" }, { name: "robots", content: "noindex" }],
  }),
  component: CheckPage,
});

/**
 * /check is no longer a webcam gate.
 * If the user lands here (e.g. from old session), we just redirect to /exam directly.
 */
function CheckPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const session = getSession();
    const attempt = session ? getAttempt(session) : null;
    if (!session || !attempt) {
      navigate({ to: "/" });
      return;
    }
    if (!attempt.termsAcceptedAt) {
      navigate({ to: "/terms" });
      return;
    }
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    startOrResume(session);
    navigate({ to: "/exam" });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="mono-label text-slate">Starting exam…</p>
    </div>
  );
}
