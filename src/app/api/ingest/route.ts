import { NextRequest, NextResponse } from "next/server";
import { getMovie, upsertMovie, type PersonRef } from "../../../lib/cache";
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

// ---- PersonRef builders ----
// Assumption (most common): PersonRef = { id: number; name: string }
function asPersonRef(id: number, name: string): PersonRef {
  return { id, name } as PersonRef;
}

function directorsFromTmdb(full: TmdbMovie): PersonRef[] {
  const crew = full.credits?.crew || [];
  return crew
    .filter((c) => c.job === "Director")
    .map((c) => asPersonRef(c.id, c.name));
}

function writersFromTmdb(full: TmdbMovie): PersonRef[] {
  const crew = full.credits?.crew || [];
  const writerJobs = new Set(["Writer", "Screenplay", "Story", "Novel", "Author"]);
  return crew
    .filter((c) => writerJobs.has(c.job))
    .map((c) => asPersonRef(c.id, c.name));
}

function castTopFromTmdb(full: TmdbMovie, n = 8): PersonRef[] {
  const cast = (full.credits?.cast || []).slice().sort((a, b) => a.order - b.order);
  return cast.slice(0, n).map((c) => asPersonRef(c.id, c.name));
}

async function ingestByTmdbId(tmdbId: number) {
  const existing = await getMovie(tmdbId);
  if (existing) return { cached: true, movie: existing };

  const full = await tmdbFetchFull(tmdbId);

  // Build base record (your existing architecture)
  const input: { tmdbId: number; full: TmdbMovie } = { tmdbId, full };
  const base = buildMovieRecordBase(input);

  // Required MovieRecord fields
  const poster = tmdbPoster(full);
  const directors = directorsFromTmdb(full);
  const writers = writersFromTmdb(full);
  const castTop = castTopFromTmdb(full, 8);

  // If your MovieRecord expects Date, change this to `new Date()`
  const updatedAt = new Date().toISOString();

  // Vectors
  const feelVec = feelVectorFromText(base.overview, base.tagline, 256);
  const styleVec = feelVec;

  const saved = await upsertMovie({
    ...base,
    poster,
    directors,
    writers,
    castTop,
    feelVec,
    styleVec,
    updatedAt,
  });

  // Async IMDb augment
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
