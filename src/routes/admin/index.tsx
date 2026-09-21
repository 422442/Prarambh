import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Prarambh" },
      { name: "description", content: "Administrative dashboard for the Prarambh entrance exam." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboardPage,
});

interface Stats {
  total: number;
  inProgress: number;
  submitted: number;
  avgScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  violationCount: number;
}

function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError("Failed to load statistics");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <AdminShell title="Dashboard">
        <div className="text-center py-12 text-slate">Loading statistics...</div>
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell title="Dashboard">
        <div className="text-center py-12 text-destructive">{error}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Dashboard">
      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-6 border border-border/80">
          <div className="text-sm text-slate mb-1">Total Participants</div>
          <div className="text-3xl font-bold text-foreground">{stats?.total ?? 0}</div>
        </div>
        <div className="surface-card p-6 border border-border/80">
          <div className="text-sm text-slate mb-1">In Progress</div>
          <div className="text-3xl font-bold text-blue-600">{stats?.inProgress ?? 0}</div>
        </div>
        <div className="surface-card p-6 border border-border/80">
          <div className="text-sm text-slate mb-1">Submitted</div>
          <div className="text-3xl font-bold text-deep-green">{stats?.submitted ?? 0}</div>
        </div>
        <div className="surface-card p-6 border border-border/80">
          <div className="text-sm text-slate mb-1">Violations</div>
          <div className="text-3xl font-bold text-coral">{stats?.violationCount ?? 0}</div>
        </div>
      </div>

      {/* Score Stats */}
      {stats && stats.submitted > 0 && (
        <div className="mt-6 surface-card p-6 border border-border/80">
          <h2 className="text-lg font-semibold text-foreground mb-4">Score Summary</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-slate mb-1">Average Score</div>
              <div className="text-2xl font-semibold text-foreground">
                {stats.avgScore !== null ? stats.avgScore.toFixed(1) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate mb-1">Highest Score</div>
              <div className="text-2xl font-semibold text-deep-green">
                {stats.highestScore !== null ? stats.highestScore.toFixed(1) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate mb-1">Lowest Score</div>
              <div className="text-2xl font-semibold text-coral">
                {stats.lowestScore !== null ? stats.lowestScore.toFixed(1) : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-6 surface-card p-6 border border-border/80">
        <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/admin/export"
            className="pill-outline px-4 py-2 text-sm font-medium hover:bg-secondary inline-block"
          >
            Export CSV
          </a>
          <a
            href="/admin/participants"
            className="pill-outline px-4 py-2 text-sm font-medium hover:bg-secondary inline-block"
          >
            View Participants
          </a>
          <a
            href="/admin/questions"
            className="pill-outline px-4 py-2 text-sm font-medium hover:bg-secondary inline-block"
          >
            Manage Questions
          </a>
        </div>
      </div>
    </AdminShell>
  );
}
