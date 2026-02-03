// src/lib/tmdb.ts

export type TmdbMovie = {
  id: number;
  title: string;
  overview?: string;
  tagline?: string;
  release_date?: string;
  runtime?: number | null;
  vote_average?: number;
  vote_count?: number;

  genres?: { id: number; name: string }[];

  credits?: {
    cast?: { id: number; name: string; order: number }[];
    crew?: { id: number; name: string; job: string; department: string }[];
  };

  keywords?: { keywords?: { id: number; name: string }[] };

  external_ids?: {
    imdb_id?: string | null;
  };
};

const TMDB_BASE = "https://api.themoviedb.org/3";

/**
 * Generic TMDB GET using v3 API key (?api_key=...).
 * IMPORTANT: TMDB_API_KEY must be your v3 key (32 hex chars).
 */
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY missing");

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.status_message || `TMDB error (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export function yearFromDate(date?: string) {
  if (!date || date.length < 4) return undefined;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : undefined;
}

export function pickDirectorId(m: TmdbMovie): number | undefined {
  const crew = m.credits?.crew || [];
  const director = crew.find((c) => c.job === "Director");
  return director?.id;
}

export function topCastIds(m: TmdbMovie, n = 6): number[] {
  const cast = (m.credits?.cast || []).slice().sort((a, b) => a.order - b.order);
  return cast.slice(0, n).map((c) => c.id);
}

export function genreIds(m: TmdbMovie): number[] {
  return (m.genres || []).map((g) => g.id);
}

export function keywordIds(m: TmdbMovie): number[] {
  const kws = m.keywords?.keywords || [];
  return kws.map((k) => k.id);
}

/**
 * ✅ Compatibility export for your existing ingest route:
 * import { tmdbFetchFull } from "../../../lib/tmdb";
 *
 * Fetch details + credits + keywords + external_ids in one shot.
 */
export async function tmdbFetchFull(tmdbId: number): Promise<TmdbMovie> {
  return await tmdbGet<TmdbMovie>(`/movie/${tmdbId}`, {
    append_to_response: "credits,keywords,external_ids",
    language: "en-US",
  });
}

/**
 * ✅ Compatibility export for your existing ingest route:
 * import { buildMovieRecordBase } from "../../../lib/tmdb";
 *
 * Your code calls:
 *   buildMovieRecordBase({ tmdbId, full })
 *
 * Other code may call:
 *   buildMovieRecordBase(full)
 *
 * So we accept BOTH.
 */
export function buildMovieRecordBase(
  input: TmdbMovie | { tmdbId: number; full: TmdbMovie }
) {
  const full =
    (input as any)?.full && typeof (input as any)?.full === "object"
      ? ((input as any).full as TmdbMovie)
      : (input as TmdbMovie);

  const year = yearFromDate(full.release_date);

  return {
    // Use TMDB payload as source of truth
    tmdbId: full.id,

    title: full.title,
    year,
    runtime: full.runtime ?? null,

    overview: full.overview ?? "",
    tagline: full.tagline ?? "",

    tmdbVoteAverage: full.vote_average ?? null,
    tmdbVoteCount: full.vote_count ?? null,

    imdbId: full.external_ids?.imdb_id ?? null,

    // for similarity / glue / later embedding computation
    genreIds: genreIds(full),
    keywordIds: keywordIds(full),
    directorId: pickDirectorId(full) ?? null,
    topCastIds: topCastIds(full, 8),

    // optional human-readable fields (handy for debugging / UI)
    genres: (full.genres || []).map((g) => g.name),
    keywords: (full.keywords?.keywords || []).map((k) => k.name),
  };
}
