"use client";

import { useMemo, useState } from "react";

type TMDBSearchResult = {
  id: number;
  title: string;
  year: string | null;
  poster: string | null;
};

type RecResult = {
  id: number;
  title: string;
  year: number | null;
  poster: string | null;
  directors: string;
  vote_average: number | null;
  vote_count: number | null;
  breakdown: {
    RecScore: number;
    FeelSim: number;
    DirectionSim: number;
    StyleSim: number;
    DecadeFit: number;
    ActingSim: number;
    Quality: number;
    WorldSim: number;
  };
};

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TMDBSearchResult[]>([]);
  const [seed, setSeed] = useState<TMDBSearchResult | null>(null);

  const [ingesting, setIngesting] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recs, setRecs] = useState<RecResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canSearch = q.trim().length >= 2;

  async function doSearch() {
    if (!canSearch) return;
    setError(null);
    setSearching(true);
    setResults([]);
    setSeed(null);
    setRecs([]);
    try {
      const r = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q.trim())}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSearching(false);
    }
  }

  async function ingestAndRecommend(movie: TMDBSearchResult) {
    setError(null);
    setSeed(movie);
    setRecs([]);
    setIngesting(true);
    try {
      const r = await fetch(`/api/ingest?tmdbId=${movie.id}`, { method: "POST" });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setError(e?.message || String(e));
      setIngesting(false);
      return;
    } finally {
      setIngesting(false);
    }

    setRecsLoading(true);
    try {
      const r = await fetch(`/api/recommend?tmdbId=${movie.id}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setRecs(data.results || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRecsLoading(false);
    }
  }

  const subtitle = useMemo(() => {
    if (!seed) return "Search and pick a seed movie to generate recommendations.";
    return `Seed: ${seed.title}${seed.year ? ` (${seed.year})` : ""}`;
  }, [seed]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 text-sm text-zinc-300">{subtitle}</div>

      <div className="flex gap-2">
        <input
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          placeholder="Search TMDB… (e.g. Whiplash)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch();
          }}
        />
        <button
          className="rounded-xl border border-zinc-700 bg-zinc-100 px-3 py-2 text-zinc-900 font-semibold disabled:opacity-50"
          disabled={!canSearch || searching}
          onClick={doSearch}
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4 grid gap-2">
          {results.map((m) => (
            <button
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left hover:border-zinc-600"
              onClick={() => ingestAndRecommend(m)}
              disabled={ingesting || recsLoading}
            >
              {m.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.poster} alt="" className="h-14 w-10 rounded-md object-cover" />
              ) : (
                <div className="h-14 w-10 rounded-md bg-zinc-800" />
              )}
              <div className="flex-1">
                <div className="font-semibold">{m.title}</div>
                <div className="text-xs text-zinc-400">{m.year || "—"}</div>
              </div>
              <div className="text-xs text-zinc-400">
                {ingesting || recsLoading ? "Working…" : "Pick"}
              </div>
            </button>
          ))}
        </div>
      )}

      {(ingesting || recsLoading) && (
        <div className="mt-4 text-sm text-zinc-300">
          {ingesting ? "Ingesting TMDB data + computing tone…" : "Generating recommendations…"}
        </div>
      )}

      {recs.length > 0 && (
        <div className="mt-6 grid gap-3">
          {recs.map((r) => (
            <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex gap-3">
                {r.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.poster} alt="" className="h-24 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="h-24 w-16 rounded-lg bg-zinc-800" />
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">
                        {r.title}{" "}
                        <span className="text-sm text-zinc-400">
                          ({r.year ?? "—"})
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {r.directors || "—"} · TMDB {r.vote_average ?? "—"} ({r.vote_count ?? "—"})
                      </div>
                    </div>
                    <div className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold">
                      {r.breakdown.RecScore.toFixed(3)}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-300">
                    <Metric label="Feel" v={r.breakdown.FeelSim} />
                    <Metric label="Direction" v={r.breakdown.DirectionSim} />
                    <Metric label="Style" v={r.breakdown.StyleSim} />
                    <Metric label="Decade" v={r.breakdown.DecadeFit} />
                    <Metric label="Acting" v={r.breakdown.ActingSim} />
                    <Metric label="Quality" v={r.breakdown.Quality} />
                    <Metric label="World" v={r.breakdown.WorldSim} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-1">
      <div className="font-semibold">{label}</div>
      <div className="tabular-nums">{pct}</div>
    </div>
  );
}
