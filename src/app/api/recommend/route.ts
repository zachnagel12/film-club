import { NextRequest, NextResponse } from "next/server";
import { getAllMovies, getMovie, upsertMovie, getOrCreateUser } from "../../../lib/cache";
import { recV2Breakdown } from "../../../lib/score";
import type { MovieRecord, Recommendation } from "../../../lib/types";
import { tmdbDiscoverIds, tmdbFetchFull, tmdbRecommendIds, tmdbSimilarIds, buildMovieRecordBase } from "../../../lib/tmdb";
import { feelVectorFromText } from "../../../lib/embeddings";
import { rerankPersonal } from "../../../lib/personalize";

function uniq(nums: number[]) {
  return Array.from(new Set(nums));
}

function clampTop<T>(arr: T[], n: number) {
  return arr.slice(0, Math.max(0, n));
}

async function ensureInCache(tmdbId: number) {
  const existing = getMovie(tmdbId);
  if (existing) return existing;

  const full = await tmdbFetchFull(tmdbId);
  const base = buildMovieRecordBase({ tmdbId, full });
  const feelVec = feelVectorFromText(base.overview, base.tagline, 256);
  const styleVec = feelVec;

  const record: MovieRecord = {
    ...base,
    feelVec,
    styleVec,
    updatedAt: Date.now()
  };
  upsertMovie(record);
  return record;
}

function directorKey(m: MovieRecord) {
  return m.directors[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const tmdbId = Number(req.nextUrl.searchParams.get("tmdbId"));
    if (!tmdbId) return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });

    const personalize = req.nextUrl.searchParams.get("personalize") === "1";
    const userId = req.nextUrl.searchParams.get("userId") || "default";

    const seed = await ensureInCache(tmdbId);

    // --- Candidate generation (70/20/10) ---
    // We mix cached neighbors + TMDB pull for coverage while cache is small.

    const cached = getAllMovies().filter((m) => m.tmdbId !== seed.tmdbId);

    // 70% feel neighbors (cached only)
    const feelNeighbors = cached
      .map((m) => ({ m, sim: recV2Breakdown(seed, m).FeelSim }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 70)
      .map((x) => x.m.tmdbId);

    // 20% world neighbors (TMDB discover by genres/keywords)
    const kw = seed.keywords.slice(0, 6).map((k) => k.id).join("|");
    const gs = seed.genres.slice(0, 3).map((g) => g.id).join(",");

    const worldIds = await tmdbDiscoverIds({
      with_keywords: kw || undefined,
      with_genres: gs || undefined,
      vote_count_gte: 50,
      page: 1
    });

    // 10% surprise bridge: same director/writer/lead actor (TMDB discover)
    const topDirector = seed.directors[0]?.id;
    const topCast = seed.castTop[0]?.id;
    const bridgeIds = uniq([
      ...(topDirector ? await tmdbDiscoverIds({ with_crew: String(topDirector), vote_count_gte: 50, page: 1 }) : []),
      ...(topCast ? await tmdbDiscoverIds({ with_cast: String(topCast), vote_count_gte: 50, page: 1 }) : [])
    ]);

    // Add TMDB similar/recommendations for good measure (helps early cache)
    const tmdbBackfill = uniq([...(await tmdbSimilarIds(seed.tmdbId)), ...(await tmdbRecommendIds(seed.tmdbId))]);

    // Combine pool
    const poolIds = uniq([
      ...feelNeighbors,
      ...worldIds,
      ...bridgeIds,
      ...tmdbBackfill
    ]).filter((id) => id !== seed.tmdbId);

    // Ensure some of these exist in cache
    const ensureIds = clampTop(poolIds, 60);
    const ensured: MovieRecord[] = [];
    for (const id of ensureIds) {
      try {
        ensured.push(await ensureInCache(id));
      } catch {
        // skip
      }
    }

    // Score
    const scored = ensured
      .map((m) => ({ m, b: recV2Breakdown(seed, m) }))
      .sort((a, b) => b.b.RecScore - a.b.RecScore);

    // Diversity: max 2 per director in top 10
    const out: Recommendation[] = [];
    const directorCounts = new Map<number, number>();

    for (const s of scored) {
      const d = directorKey(s.m);
      if (out.length < 10 && d) {
        const c = directorCounts.get(d) ?? 0;
        if (c >= 2) continue;
        directorCounts.set(d, c + 1);
      }
      out.push({
        tmdbId: s.m.tmdbId,
        title: s.m.title,
        year: s.m.year,
        poster: s.m.poster,
        directors: s.m.directors.map((x) => x.name).join(", "),
        vote_average: s.m.tmdbVoteAverage,
        vote_count: s.m.tmdbVoteCount,
        breakdown: s.b
      });
      if (out.length >= 25) break;
    }

    // Optional personalization rerank over same candidate pool
    if (personalize) {
      const user = getOrCreateUser(userId);
      const moviesById = new Map(ensured.map((m) => [m.tmdbId, m]));
      const base = out.map((r) => ({ tmdbId: r.tmdbId, baseScore: r.breakdown.RecScore }));
      const reranked = rerankPersonal(base, moviesById, user);

      const byId = new Map(out.map((r) => [r.tmdbId, r]));
      const rerankedOut = reranked
        .map((x) => byId.get(x.tmdbId))
        .filter(Boolean) as Recommendation[];

      return NextResponse.json({
        seed: { id: seed.tmdbId, title: seed.title, year: seed.year, poster: seed.poster },
        results: rerankedOut
      });
    }

    return NextResponse.json({
      seed: { id: seed.tmdbId, title: seed.title, year: seed.year, poster: seed.poster },
      results: out
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
