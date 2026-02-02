"use client";

import { useMemo, useState } from "react";

type SearchHit = {
  id: number;
  title: string;
  year: string | null;          // <- from your TMDBSearchResult type
  poster: string | null;        // <- can be full URL or TMDB poster path
  director?: string | null;     // <- we’ll add this in the API route
};

type Recommendation = {
  tmdbId: number;
  title: string;
  year: number;
  poster?: string | null;       // <- full URL or TMDB poster path
  directors?: string;           // <- already in your recommend response
  vote_average?: number;
  vote_count?: number;
  reason?: string;              // <- new one-liner
};

function tmdbPosterFromPath(posterPath: string, size: "w92" | "w185" | "w342" = "w185") {
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}

function normalizePosterUrl(poster?: string | null, size: "w92" | "w185" | "w342" = "w185") {
  if (!poster) return null;

  // already a full URL
  if (poster.startsWith("http://") || poster.startsWith("https://")) return poster;

  // TMDB poster path like "/abc123.jpg"
  if (poster.startsWith("/")) return tmdbPosterFromPath(poster, size);

  // fallback (in case you store something unexpected)
  return poster;
}

export default function SearchBox() {
  const [view, setView] = useState<"search" | "loading" | "results">("search");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit | null>(null);

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
    // Expecting { results: SearchHit[] }
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
            const posterUrl = normalizePosterUrl(r.poster ?? null, "w185");
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

  // ✅ Search UI (shows poster + year + director)
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

      {/* Selected preview */}
      {selected && (
        <div className="mt-4 flex items-center justify-between rounded border p-3">
          <div className="flex min-w-0 items-center gap-3">
            {normalizePosterUrl(selected.poster, "w92") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={normalizePosterUrl(selected.poster, "w92")!}
                alt={`${selected.title} poster`}
                className="h-[84px] w-[56px] rounded object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-[84px] w-[56px] rounded bg-zinc-100" />
            )}

            <div className="min-w-0">
              <div className="truncate font-medium">
                {selected.title} <span className="opacity-60">({selected.year ?? "—"})</span>
              </div>
              {selected.director && <div className="truncate text-sm opacity-70">{selected.director}</div>}
              <div className="text-xs opacity-60">TMDB ID: {selected.id}</div>
            </div>
          </div>

          <button onClick={() => setSelected(null)} className="rounded border px-3 py-1 text-sm">
            Change
          </button>
        </div>
      )}

      {/* Search hits */}
      <div className="mt-4 space-y-2">
        {hits.slice(0, 10).map((h) => {
          const isSelected = selected?.id === h.id;
          const posterUrl = normalizePosterUrl(h.poster, "w92");

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
                  {h.title} <span className="opacity-60">({h.year ?? "—"})</span>
                </div>
                {h.director && <div className="truncate text-sm opacity-70">{h.director}</div>}
                <div className="text-xs opacity-60">TMDB ID: {h.id}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
