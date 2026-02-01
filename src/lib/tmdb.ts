import type { MovieRecord, PersonRef, TMDBSearchResult } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const POSTER = "https://image.tmdb.org/t/p/w342";
const POSTER_SM = "https://image.tmdb.org/t/p/w185";

function key() {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error("Missing TMDB_API_KEY");
  return k;
}

async function tmdb(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", key());
  url.searchParams.set("language", "en-US");
  url.searchParams.set("include_adult", "false");

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TMDB ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export async function tmdbSearch(query: string): Promise<TMDBSearchResult[]> {
  const data = await tmdb("/search/movie", { query, page: 1 });
  return (data.results || []).slice(0, 10).map((m: any) => ({
    id: m.id,
    title: m.title,
    year: (m.release_date || "").slice(0, 4) || null,
    poster: m.poster_path ? `${POSTER_SM}${m.poster_path}` : null
  }));
}

function pickTopBilledCast(credits: any, n = 10): PersonRef[] {
  const cast = credits?.cast || [];
  return cast
    .slice()
    .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, n)
    .map((c: any) => ({ id: c.id, name: c.name }));
}

function pickCrew(credits: any) {
  const crew = credits?.crew || [];
  const directors: PersonRef[] = crew
    .filter((c: any) => c.job === "Director")
    .map((c: any) => ({ id: c.id, name: c.name }));

  const writers: PersonRef[] = crew
    .filter((c: any) => ["Writer", "Screenplay", "Story"].includes(c.job))
    .map((c: any) => ({ id: c.id, name: c.name }));

  return { directors, writers };
}

export async function tmdbFetchFull(tmdbId: number) {
  const [details, credits, keywords] = await Promise.all([
    tmdb(`/movie/${tmdbId}`, {}),
    tmdb(`/movie/${tmdbId}/credits`, {}),
    tmdb(`/movie/${tmdbId}/keywords`, {})
  ]);

  const year = details.release_date ? parseInt(details.release_date.slice(0, 4), 10) : null;

  const { directors, writers } = pickCrew(credits);
  const castTop = pickTopBilledCast(credits, 10);

  const poster = details.poster_path ? `${POSTER}${details.poster_path}` : null;

  return {
    details,
    year,
    poster,
    directors,
    writers,
    castTop,
    keywords: (keywords?.keywords || []).map((k: any) => ({ id: k.id, name: k.name })),
    genres: (details?.genres || []).map((g: any) => ({ id: g.id, name: g.name }))
  };
}

export async function tmdbSimilarIds(tmdbId: number): Promise<number[]> {
  const data = await tmdb(`/movie/${tmdbId}/similar`, { page: 1 });
  return (data.results || []).map((m: any) => m.id);
}

export async function tmdbRecommendIds(tmdbId: number): Promise<number[]> {
  const data = await tmdb(`/movie/${tmdbId}/recommendations`, { page: 1 });
  return (data.results || []).map((m: any) => m.id);
}

export async function tmdbDiscoverIds(params: {
  with_keywords?: string;
  with_genres?: string;
  with_cast?: string;
  with_crew?: string;
  vote_count_gte?: number;
  page?: number;
}): Promise<number[]> {
  const data = await tmdb("/discover/movie", {
    sort_by: "popularity.desc",
    page: params.page ?? 1,
    with_keywords: params.with_keywords,
    with_genres: params.with_genres,
    with_cast: params.with_cast,
    with_crew: params.with_crew,
    "vote_count.gte": params.vote_count_gte ?? 50
  });
  return (data.results || []).map((m: any) => m.id);
}

export function buildMovieRecordBase(args: {
  tmdbId: number;
  full: Awaited<ReturnType<typeof tmdbFetchFull>>;
}): Omit<MovieRecord, "feelVec" | "styleVec" | "updatedAt"> {
  const { details, year, poster, directors, writers, castTop, keywords, genres } = args.full;
  return {
    tmdbId: details.id,
    title: details.title,
    year,
    runtime: details.runtime ?? null,
    overview: details.overview || "",
    tagline: details.tagline || "",
    poster,
    genres,
    keywords,
    directors,
    writers,
    castTop,
    tmdbVoteAverage: details.vote_average ?? null,
    tmdbVoteCount: details.vote_count ?? null
  };
}
