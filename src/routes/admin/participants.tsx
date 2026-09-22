import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/participants")({
  head: () => ({
    meta: [
      { title: "Participants — Admin — Prarambh" },
      {
        name: "description",
        content: "View and manage participants for the Prarambh entrance exam.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminParticipantsPage,
});

interface Participant {
  id: string;
  name: string;
  email: string;
  status: "registered" | "in_progress" | "submitted";
  score: number | null;
  correct_count: number | null;
  violation_count: number;
  started_at: number | null;
  submitted_at: number | null;
}

function AdminParticipantsPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchParticipants() {
      try {
        const res = await fetch("/api/admin/participants?pageSize=100");
        if (!res.ok) throw new Error("Failed to fetch participants");
        const data = await res.json();
        
        const rawRows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.participants) ? data.participants : [];
        const parsed: Participant[] = rawRows.map((p: any) => ({
          id: String(p.participantId || p.id),
          name: String(p.name ?? ""),
          email: String(p.email ?? ""),
          status: p.status === "submitted" ? "submitted" : p.status === "in_progress" ? "in_progress" : "registered",
          score: p.score ?? null,
          correct_count: p.correct ?? p.correct_count ?? null,
          violation_count: Number(p.violations ?? p.violation_count ?? 0),
          started_at: p.startedAt ?? p.started_at ?? null,
          submitted_at: p.submittedAt ?? p.submitted_at ?? null,
        }));

        setParticipants(parsed);
        setTotalCount(data.total ?? parsed.length);
      } catch (err) {
        setError("Failed to load participants");
      } finally {
        setLoading(false);
      }
    }
    fetchParticipants();
  }, []);

  const filtered = participants.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AdminShell title="Participants">
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="field-input w-full max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="text-center py-12 text-slate">Loading participants...</div>}

      {error && <div className="text-center py-12 text-destructive">{error}</div>}

      {!loading && !error && (
        <>
          <div className="surface-card border border-border/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">Score</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">Violations</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate">
                        No participants found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-secondary/20">
                        <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                        <td className="px-4 py-3 text-slate">{p.email}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              p.status === "submitted"
                                ? "inline-block rounded-full bg-pale-green px-2.5 py-0.5 text-xs font-medium text-deep-green"
                                : p.status === "in_progress"
                                ? "inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                                : "inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-slate"
                            }
                          >
                            {p.status === "submitted" ? "Submitted" : p.status === "in_progress" ? "In Progress" : "Registered"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {p.score !== null ? p.score.toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={
                              p.violation_count > 0 ? "text-coral font-medium" : "text-slate"
                            }
                          >
                            {p.violation_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/api/admin/participants/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-deep-green hover:underline text-xs font-medium"
                          >
                            View Details
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate">
            Showing {filtered.length} of {participants.length} participants
          </div>
        </>
      )}
    </AdminShell>
  );
}
