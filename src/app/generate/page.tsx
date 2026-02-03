"use client";

import { useEffect, useMemo, useState } from "react";

type Movie = {
  id: number;
  title: string;
  release_date?: string;
};

type Rec = {
  id: number;
  title: string;
  year?: number;
};

export default function GeneratePage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Movie | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // search TMDB
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
        const res = await fetch(
          `/api/tmdb/search?q=${encodeURIComponent(debounced)}`
        );
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error || "Search failed");

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

  async function generateRecs(movie: Movie) {
    setSelected(movie);
    setRecLoading(true);
    setRecs([]);

    const res = await fetch(`/api/recommend?tmdbId=${movie.id}`);
    const data = await res.json();

    setRecs(data.recommendations || []);
    setRecLoading(false);
  }

  const helper = useMemo(() => {
    if (!q) return "Type a movie title (e.g., Whiplash)";
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
          />
          <div className="mt-2 text-sm text-white/60">{helper}</div>
        </div>

        {/* SEARCH RESULTS */}
        {!selected && (
          <div className="mt-6 space-y-3">
            {results.map((m) => (
              <button
                key={m.id}
                className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-4 py-3"
                onClick={() => generateRecs(m)}
              >
                <div className="font-medium">
                  {m.title}
                  {m.release_date && (
                    <span className="text-white/50">
                      {" "}
                      • {m.release_date.slice(0, 4)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* RECOMMENDATIONS */}
        {selected && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold">
              Recommendations for {selected.title}
            </h2>

            {recLoading && (
              <div className="mt-4 text-white/60">
                Generating recommendations…
              </div>
            )}

            {!recLoading && (
              <ul className="mt-4 space-y-3">
                {recs.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    {r.title}
                    {r.year && (
                      <span className="text-white/50"> • {r.year}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
