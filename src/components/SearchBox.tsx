"use client";

import { useMemo, useState } from "react";

type TmdbSearchHit = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
};

type Recommendation = {
  tmdbId: number;
  title: string;
  year: number;
  poster?: string | null;
  directors?: string;
  vote_average?: number;
  vote_count?: number;
};

export default function SearchBox() {
  const [view, setView] = useState<"search" | "loading" | "results">("search");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TmdbSearchHit[]>([]);
  const [selected, setSelected] = useState<TmdbSearchHit | null>(null);

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const top10 = useMemo(() => recs.slice(0, 10), [recs]);

  const [error, setError] = useState<string | null>(null);

  async function runSearch(q: string) {
    setError(null);
    setQuery(q);

    if (!q.trim()) {
      setHits([]);
      return;
    }

    // your existing TMDB search route
    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q.trim())}`);
    if (!res.ok) {
      setError("Search failed.");
      return;
    }
    const j = await res.json();
    setHits(j.results ?? []);
  }

  async function recommend() {
    if (!selected) {
      setError("Select a movie first.");
      return;
    }

    setError(null);
    setView("loading");

    const res = await fetch(`/api/recommend?tmdbId=${selected.id}`, { method: "GET" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Recommendation failed.");
      setView("search");
      return;
    }

    const j = await res.json();
    setRecs(j.results ?? []);

    // ✅ IMPORTANT: clear the search UI data so it “disappears”
    setQuery("");
    setHits([]);
    setSelected(null);

    // ✅ Switch to results-only view
    setView("results");
  }

  function newSearch() {
    setError(null);
    setRecs([]);
    setHits([]);
    setSelected(null);
    setQuery("");
    setView("search");
  }

  // ✅ Results-only mode (only 10 movies shown)
  if (view === "results") {
    return (
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recommended movies</h2>
          <button onClick={newSearch} className="rounded border px-3 py-1 text-sm">
            New search
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {top10.map((r) => (
            <div key={r.tmdbId} className="rounded border p-3">
              <div className="font-medium">
                {r.title} <span className="opacity-60">({r.year})</span>
              </div>
              {r.directors && <div className="text-sm opacity-70">{r.directors}</div>}
              {(r.vote_average != null || r.vote_count != null) && (
                <div className="mt-1 text-xs opacity-60">
                  {r.vote_average != null ? `TMDB ${r.vote_average}` : ""}
                  {r.vote_count != null ? ` • ${r.vote_count} votes` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Search / selection UI (hidden after results)
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Search a movie..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          onClick={recommend}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={view === "loading" || !selected}
        >
          {view === "loading" ? "Loading..." : "Search"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Results list from TMDB search (disappears once view becomes "results") */}
      <div className="mt-4 space-y-2">
        {hits.slice(0, 8).map((h) => {
          const year = h.release_date?.slice(0, 4) ?? "—";
          const isSelected = selected?.id === h.id;
          return (
            <button
              key={h.id}
              onClick={() => setSelected(h)}
              className={`w-full rounded border px-3 py-2 text-left ${
                isSelected ? "border-black" : "border-zinc-200"
              }`}
            >
              <div className="font-medium">
                {h.title} <span className="opacity-60">({year})</span>
              </div>
              <div className="text-xs opacity-60">TMDB ID: {h.id}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
