"use client";

import { useEffect, useMemo, useState } from "react";

type Movie = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
};

export default function GeneratePage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    async function run() {
      if (!debounced) {
        setResults([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(debounced)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Search failed");
        }

        setResults(data.results || []);
      } catch (e: any) {
        setError(e?.message || "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [debounced]);

  const helper = useMemo(() => {
    if (!q) return "Type a movie title (e.g., The Irishman)";
    if (loading) return "Searching…";
    if (error) return error;
    if (results.length === 0) return "No results yet.";
    return `${results.length} result(s)`;
  }, [q, loading, error, results.length]);

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">Movie Recommendation Generator</h1>
        <p className="text-white/60 mt-2">
          Search a movie, select it, and we’ll generate recommendations.
        </p>

        <div className="mt-8">
          <label className="text-sm text-white/70">Search</label>
          <input
            className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
            placeholder="Start typing…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <div className="mt-2 text-sm text-white/60">{helper}</div>
        </div>

        <div className="mt-6 space-y-3">
          {results.map((m) => (
            <button
              key={m.id}
              className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-4 py-3"
              onClick={() => alert(`Selected: ${m.title} (TMDB id ${m.id})\n\nNext: generate recs.`)}
            >
              <div className="font-medium">
                {m.title}
                {m.release_date ? (
                  <span className="text-white/50 font-normal"> • {m.release_date.slice(0, 4)}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
