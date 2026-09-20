import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { isAdmin, setAdminSession } from "@/lib/quiz-store";

interface AdminShellProps {
  title: string;
  children: ReactNode;
}

export function AdminShell({ title, children }: AdminShellProps) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!isAdmin()) {
      navigate({ to: "/admin/login" });
    } else {
      setAuthorized(true);
    }
  }, [navigate]);

  function handleLogout() {
    setAdminSession(false);
    navigate({ to: "/admin/login" });
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Admin Top Navbar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/90 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="mono-label text-base font-bold tracking-wider text-deep-green">
              PRARAMBH
            </span>
            <span className="rounded-full bg-deep-green/10 px-2.5 py-0.5 text-xs font-semibold text-deep-green">
              Admin Portal
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-4 text-sm font-medium">
            <Link
              to="/admin"
              className="text-slate hover:text-foreground [&.active]:text-deep-green"
              activeOptions={{ exact: true }}
            >
              Dashboard
            </Link>
            <Link
              to="/admin/participants"
              className="text-slate hover:text-foreground [&.active]:text-deep-green"
            >
              Participants
            </Link>
            <Link
              to="/admin/questions"
              className="text-slate hover:text-foreground [&.active]:text-deep-green"
            >
              Questions (60)
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-xs text-slate">
            devnest.techclub@gmail.com
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="pill-outline text-xs px-3.5 py-1.5 font-medium hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-6">{title}</h1>
        {children}
      </main>
    </div>
  );
}
