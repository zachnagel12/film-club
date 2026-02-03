"use client";

import { useEffect, useMemo, useState } from "react";

type Movie = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
};

type Rec = {
  id: number;
  title: string;
  year?: number;
  recScore?: number;
  reasons?: string[];
  poster?: string; // from ingest/cache or TMDB path
  poster_path?: string | null; // if your /api/recommend ever returns it
};

function tmdbPosterUrl(path?: string | null, size: "w92" | "w154" | "w185" | "w342" = "w154") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function Year({ date }: { date?: string }) {
  if (!date || date.length < 4) return null;
  return <span className="text-white/50"> • {date.slice(0, 4)}</span>;
}

export default function GeneratePage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Movie | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

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
    setRecError(null);
    setRecs([]);

    try {
      // Optional: ingest first so we definitely have poster + cached record
      await fetch(`/api/ingest?tmdbId=${movie.id}`);

      const res = await fetch(`/api/recommend?tmdbId=${movie.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Recommend failed");

      setRecs(data.recommendations || []);
    } catch (e: any) {
      setRecError(e?.message || "Failed to generate recommendations");
    } finally {
      setRecLoading(false);
    }
  }

  function reset() {
    setSelected(null);
    setRecs([]);
    setRecError(null);
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Movie Recommendation Generator</h1>
            <p className="text-white/60 mt-2">
              Search a movie, select it, and we’ll generate recommendations.
            </p>
          </div>

          {selected && (
            <button
              onClick={reset}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2"
            >
              ← New search
            </button>
          )}
        </div>

        {!selected && (
          <>
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

            <div className="mt-6 space-y-3">
              {results.map((m) => {
                const posterUrl = tmdbPosterUrl(m.poster_path, "w92");
                return (
                  <button
                    key={m.id}
                    className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-4 py-3"
                    onClick={() => generateRecs(m)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Poster */}
                      <div className="h-16 w-12 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                        {posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={posterUrl}
                            alt={`${m.title} poster`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] text-white/40">
                            No poster
                          </div>
                        )}
                      </div>

                      {/* Text */}
                      <div>
                        <div className="font-medium">
                          {m.title}
                          <Year date={m.release_date} />
                        </div>
                        <div className="text-sm text-white/50">
                          TMDB #{m.id}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

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

            {recError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                {recError}
              </div>
            )}

            {!recLoading && !recError && (
              <ul className="mt-4 space-y-3">
                {recs.map((r, idx) => {
                  // r.poster in your cache is the TMDB poster_path (we stored it that way)
                  const posterUrl =
                    tmdbPosterUrl((r as any).poster_path, "w92") ||
                    tmdbPosterUrl((r as any).poster, "w92") ||
                    null;

                  return (
                    <li
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div className="flex items-center gap-4">
                        {/* Poster */}
                        <div className="h-16 w-12 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                          {posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={posterUrl}
                              alt={`${r.title} poster`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-[10px] text-white/40">
                              No poster
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="font-medium">
                              {idx + 1}. {r.title}
                              {r.year ? (
                                <span className="text-white/50 font-normal">
                                  {" "}
                                  • {r.year}
                                </span>
                              ) : null}
                            </div>
                            {typeof r.recScore === "number" && (
                              <div className="text-white/50 text-sm">
                                score {r.recScore.toFixed(3)}
                              </div>
                            )}
                          </div>

                          {r.reasons?.length ? (
                            <div className="mt-2 text-sm text-white/60">
                              {r.reasons.join(" • ")}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

