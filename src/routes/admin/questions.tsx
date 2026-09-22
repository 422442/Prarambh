import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/questions")({
  head: () => ({
    meta: [
      { title: "Questions — Admin — Prarambh" },
      { name: "description", content: "Manage questions for the Prarambh entrance exam." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminQuestionsPage,
});

interface Question {
  id: string;
  text: string;
  options: Record<string, string>;
  correct: string;
  is_active: boolean;
}

function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch("/api/admin/questions?pageSize=200");
        if (!res.ok) throw new Error("Failed to fetch questions");
        const data = await res.json();
        
        const rawRows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.questions) ? data.questions : [];
        const parsed: Question[] = rawRows.map((q: any) => ({
          id: String(q.id),
          text: String(q.text),
          options: q.options || {
            A: String(q.optionA ?? q.option_a ?? ""),
            B: String(q.optionB ?? q.option_b ?? ""),
            C: String(q.optionC ?? q.option_c ?? ""),
            D: String(q.optionD ?? q.option_d ?? ""),
          },
          correct: String(q.correctOption ?? q.correct_option ?? q.correct ?? "A"),
          is_active: q.isActive ?? q.is_active ?? true,
        }));

        setQuestions(parsed);
        setTotalCount(data.total ?? parsed.length);
      } catch (err) {
        setError("Failed to load questions");
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  const filtered = questions.filter((q) => q.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminShell title="Questions">
      {/* Search */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search questions..."
          className="field-input w-full max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-slate">{totalCount || questions.length} questions total</span>
      </div>

      {loading && <div className="text-center py-12 text-slate">Loading questions...</div>}

      {error && <div className="text-center py-12 text-destructive">{error}</div>}

      {!loading && !error && (
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="surface-card p-8 text-center text-slate border border-border/80">
              No questions found
            </div>
          ) : (
            filtered.map((q, idx) => (
              <div key={q.id} className="surface-card p-6 border border-border/80">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="mono-label text-xs text-slate">Q{idx + 1}</span>
                      {q.is_active ? (
                        <span className="rounded-full bg-pale-green px-2 py-0.5 text-xs font-medium text-deep-green">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-slate">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-foreground">{q.text}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(q.options).map(([letter, text]) => (
                        <div
                          key={letter}
                          className={`text-sm px-3 py-2 rounded-lg ${
                            letter === q.correct
                              ? "bg-pale-green/50 border border-deep-green/30 text-deep-green font-medium"
                              : "bg-secondary/30 text-slate"
                          }`}
                        >
                          <span className="mono-label font-semibold">{letter}:</span> {text}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </AdminShell>
  );
}
