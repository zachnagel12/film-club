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

async function ingestByTmdbId(tmdbId: number) {
  // 1) Check cache first (your cache layer decides the shape)
  const existing = await getMovie(tmdbId);
  if (existing) {
    return { cached: true, movie: existing };
  }

  // 2) Fetch full TMDB payload
  const full = await tmdbFetchFull(tmdbId);

  // 3) Build base record (IMPORTANT: avoid object-literal type inference issues)
  const input: { tmdbId: number; full: TmdbMovie } = { tmdbId, full };
  const base = buildMovieRecordBase(input);

  // 4) Compute vectors (feel + style placeholder)
  const feelVec = feelVectorFromText(base.overview, base.tagline, 256);
  const styleVec = feelVec; // placeholder per architecture

  // 5) Upsert into cache/DB
  const saved = await upsertMovie({
    ...base,
    feelVec,
    styleVec,
  });

  // 6) Fire-and-forget IMDb augment (don’t block response)
  //    If your imdb pipeline expects tmdbId + imdbId, we pass what we have.
  //    Wrap in try/catch so ingestion never fails because IMDb fails.
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
