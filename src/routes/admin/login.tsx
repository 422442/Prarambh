import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { setAdminSession } from "@/lib/quiz-store";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Login — Prarambh" },
      { name: "description", content: "Administrative login for the Prarambh entrance exam portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      setAdminSession(true);
      navigate({ to: "/admin" });
    } catch (err) {
      setError("Network error. Please check your connection.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="mono-label text-2xl font-bold tracking-wider text-deep-green">PRARAMBH</span>
          <div className="mt-2 inline-block rounded-full bg-deep-green/10 px-3 py-1 text-xs font-semibold text-deep-green">
            Admin Portal
          </div>
        </div>

        {/* Login Card */}
        <div className="surface-card p-8 shadow-lg border border-border/80">
          <h1 className="text-2xl font-semibold text-foreground mb-6">Administrator Login</h1>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="mono-label block text-sm text-slate" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="field-input mt-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="mono-label block text-sm text-slate" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="field-input mt-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="pill-primary w-full py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate">
          Contact the exam coordinator for access credentials.
        </p>
      </div>
    </div>
  );
}
