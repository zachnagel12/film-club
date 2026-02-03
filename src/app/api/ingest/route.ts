import { NextRequest, NextResponse } from "next/server";
import { getMovie, upsertMovie } from "../../../lib/cache";
import { buildMovieRecordBase, tmdbFetchFull, type TmdbMovie } from "../../../lib/tmdb";
import { feelVectorFromText } from "../../../lib/embeddings";
import { fetchIMDbAugment } from "../../../lib/imdb";

export const runtime = "nodejs";

function parseTmdbIdFromRequest(req: NextRequest): number | null {
  const tmdbIdStr = req.nextUrl.searchParams.get("tmdbId");
  if (!tmdbIdStr) return null;
  const n = Number(tmdbIdStr);
  return Number.isFinite(n) ? n : null;
}

async function parseTmdbIdFromBody(req: NextRequest): Promise<number | null> {
  try {
    const body = await req.json();
    const n = Number(body?.tmdbId);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function tmdbPoster(full: TmdbMovie): string {
  const p = (full as any)?.poster_path as string | undefined | null;
  return p || "";
}

/**
 * Build "person-like" objects from TMDB credits.
 * We intentionally do NOT import PersonRef (not exported by lib/cache).
 * We pass the right shape and cast to satisfy the MovieRecord type expected by upsertMovie.
 */
function directorsFromTmdb(full: TmdbMovie) {
  const crew = full.credits?.crew || [];
  return crew
    .filter((c) => c.job === "Director")
    .map((c) => ({ id: c.id, name: c.name }));
}

function writersFromTmdb(full: TmdbMovie) {
  const crew = full.credits?.crew || [];
  const writerJobs = new Set(["Writer", "Screenplay", "Story", "Novel", "Author"]);
  return crew
    .filter((c) => writerJobs.has(c.job))
    .map((c) => ({ id: c.id, name: c.name }));
}

function castTopFromTmdb(full: TmdbMovie, n = 8) {
  const cast = (full.credits?.cast || []).slice().sort((a, b) => a.order - b.order);
  return cast.slice(0, n).map((c) => ({ id: c.id, name: c.name }));
}

async function ingestByTmdbId(tmdbId: number) {
  // 1) Cache check
  const existing = await getMovie(tmdbId);
  if (existing) return { cached: true, movie: existing };

  // 2) Fetch full TMDB
  const full = await tmdbFetchFull(tmdbId);

  // 3) Base record (your existing interface)
  const input: { tmdbId: number; full: TmdbMovie } = { tmdbId, full };
  const base = buildMovieRecordBase(input);

  // 4) Required MovieRecord fields
  const poster = tmdbPoster(full);

  // These must match PersonRef[] in MovieRecord.
  // We provide {id,name} objects and cast to avoid importing non-exported types.
  const directors = directorsFromTmdb(full) as any;
  const writers = writersFromTmdb(full) as any;
  const castTop = castTopFromTmdb(full, 8) as any;

  // updatedAt might be Date or string depending on your MovieRecord.
  // Date is safer for TS if it's Date; if your type is string, it will still serialize.
  const updatedAt = new Date() as any;

  // 5) Vectors
  const feelVec = feelVectorFromText(base.overview, base.tagline, 256);
  const styleVec = feelVec; // placeholder

  // 6) Upsert
  const saved = await upsertMovie({
    ...base,
    poster,
    directors,
    writers,
    castTop,
    feelVec,
    styleVec,
    updatedAt,
  } as any);

  // 7) IMDb augment async
  (async () => {
    try {
      await fetchIMDbAugment(saved);
    } catch (e) {
      console.error("IMDb augment failed:", e);
    }
  })();

  return { cached: false, movie: saved };
}

export async function GET(req: NextRequest) {
  try {
    const tmdbId = parseTmdbIdFromRequest(req);
    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required. Use /api/ingest?tmdbId=123" },
        { status: 400 }
      );
    }

    const result = await ingestByTmdbId(tmdbId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("INGEST GET ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Ingest failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tmdbId = await parseTmdbIdFromBody(req);
    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required in JSON body: { tmdbId: 123 }" },
        { status: 400 }
      );
    }

    const result = await ingestByTmdbId(tmdbId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("INGEST POST ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Ingest failed" },
      { status: 500 }
    );
  }
}
