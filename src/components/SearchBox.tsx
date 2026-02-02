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
  // NOTE: your API returns `poster` as string|null
  // It might be a full URL OR a TMDB poster path. We'll handle both.
  poster?: string | null;
  directors?: string;
  vote_average?: number;
  vote_count?: number;
  reason?: string;
};

function yearFromDate(d?: string) {
  return d?.slice(0, 4) ?? "—";
}

function tmdbPosterFromPath(posterPath?: string | null, size: "w92" | "w185" | "w342" = "w185") {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}

function normalizePosterUrl(poster?: string | null, size: "w92" | "w185" | "w342" = "w185") {
  if (!poster) return null;
  // full URL already
  if (poster.startsWith("http://") || poster.startsWith("https://")) return poster;
  // if it's a TMDB poster path like "/abc123.jpg"
  if (poster.startsWith("/")) return tmdbPosterFromPath(poster, size);
  return poster; // fallback
}

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

    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q.trim())}`);
    if (!res.ok) {
      setError("Search failed.");
      return;
    }

    const j = await res.json();
    // Expecting j.results items with poster_path; keep as-is
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

    // hide search UI once recs exist
    setQuery("");
    setHits([]);
    setSelected(null);
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

  // ✅ Results-only mode (only 10 recs shown)
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
          {top10.map((r) => {
            const posterUrl = normalizePosterUrl(r.poster, "w185");
            return (
              <div key={r.tmdbId} className="flex gap-3 rounded border p-3">
                {posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterUrl}
                    alt={`${r.title} poster`}
                    className="h-[84px] w-[56px] flex-none rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-[84px] w-[56px] flex-none rounded bg-zinc-100" />
                )}

                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {r.title} <span className="opacity-60">({r.year})</span>
                  </div>

                  {r.directors && <div className="truncate text-sm opacity-70">{r.directors}</div>}

                  {r.reason && <div className="mt-1 text-sm opacity-80">{r.reason}</div>}

                  {(r.vote_average != null || r.vote_count != null) && (
                    <div className="mt-1 text-xs opacity-60">
                      {r.vote_average != null ? `TMDB ${r.vote_average}` : ""}
                      {r.vote_count != null ? ` • ${r.vote_count} votes` : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ✅ Search / selection UI (with poster cards)
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

      {/* Selected preview card (optional but helpful) */}
      {selected && (
        <div className="mt-4 flex items-center justify-between rounded border p-3">
          <div className="flex min-w-0 items-center gap-3">
            {tmdbPosterFromPath(selected.poster_path, "w92") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tmdbPosterFromPath(selected.poster_path, "w92")!}
                alt={`${selected.title} poster`}
                className="h-[84px] w-[56px] rounded object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-[84px] w-[56px] rounded bg-zinc-100" />
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">
                {selected.title} <span className="opacity-60">({yearFromDate(selected.release_date)})</span>
              </div>
              <div className="text-xs opacity-60">TMDB ID: {selected.id}</div>
            </div>
          </div>

          <button onClick={() => setSelected(null)} className="rounded border px-3 py-1 text-sm">
            Change
          </button>
        </div>
      )}

      {/* Search results as cards */}
      <div className="mt-4 space-y-2">
        {hits.slice(0, 8).map((h) => {
          const year = yearFromDate(h.release_date);
          const isSelected = selected?.id === h.id;
          const posterUrl = tmdbPosterFromPath(h.poster_path, "w92");

          return (
            <button
              key={h.id}
              onClick={() => setSelected(h)}
              className={`flex w-full items-center gap-3 rounded border p-3 text-left ${
                isSelected ? "border-black" : "border-zinc-200"
              }`}
            >
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={posterUrl}
                  alt={`${h.title} poster`}
                  className="h-[84px] w-[56px] flex-none rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-[84px] w-[56px] flex-none rounded bg-zinc-100" />
              )}

              <div className="min-w-0">
                <div className="truncate font-medium">
                  {h.title} <span className="opacity-60">({year})</span>
                </div>
                <div className="text-xs opacity-60">TMDB ID: {h.id}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
