import { NextRequest, NextResponse } from "next/server";
import { getMovie, upsertMovie } from "../../../lib/cache";
import { buildMovieRecordBase, tmdbFetchFull } from "../../../lib/tmdb";
import { feelVectorFromText } from "../../../lib/embeddings";
import { fetchIMDbAugment } from "../../../lib/imdb";

export async function POST(req: NextRequest) {
  try {
    const tmdbId = Number(req.nextUrl.searchParams.get("tmdbId"));
    if (!tmdbId) return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });

    const existing = getMovie(tmdbId);
    if (existing) {
      return NextResponse.json({ ok: true, cached: true });
    }

    const full = await tmdbFetchFull(tmdbId);
    const base = buildMovieRecordBase({ tmdbId, full });

    const feelVec = feelVectorFromText(base.overview, base.tagline, 256);
    const styleVec = feelVec; // placeholder; keep architecture

    const record = {
      ...base,
      feelVec,
      styleVec,
      updatedAt: Date.now()
    };

    upsertMovie(record);

    // Async augmentation (don’t block)
    fetchIMDbAugment(tmdbId)
      .then((aug) => {
        if (!aug) return;
        const cur = getMovie(tmdbId);
        if (!cur) return;
        upsertMovie({ ...cur, imdb: aug, updatedAt: Date.now() });
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
