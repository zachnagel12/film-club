import { NextRequest, NextResponse } from "next/server";
import { getAllMovies, getMovie, upsertMovie, getOrCreateUser } from "../../../lib/cache";
import { recV2Breakdown } from "../../../lib/score";
import type { MovieRecord, Recommendation } from "../../../lib/types";
import { tmdbDiscoverIds, tmdbFetchFull, tmdbRecommendIds, tmdbSimilarIds, buildMovieRecordBase } from "../../../lib/tmdb";
import { feelVectorFromText } from "../../../lib/embeddings";
import { rerankPersonal } from "../../../lib/personalize";
import { oneLineReason } from "../../../lib/reason";

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function clampTop<T>(arr: T[], n: number) {
  return arr.slice(0, Math.max(0, n));
}

/**
 * Random sample from an array (cheap shuffle then slice).
 * Helps diversify the ensured cache set so you don't always ingest the same lane.
 */
function sample<T>(arr: T[], n: number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

async function ensureInCache(tmdbId: number) {
  const existing = getMovie(tmdbId);
  if (existing) return existing;

  const full = await tmdbFetchFull(tmdbId);
  const base = buildMovieRecordBase({ tmdbId, full });
  const feelVec = feelVectorFromText(base.overview, base.tagline, 256);
  const styleVec = feelVec; // keep for now; ideal future: true style embedding

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

function leadActorKey(m: MovieRecord) {
  return m.castTop?.[0]?.id ?? null;
}

function decadeKey(m: MovieRecord) {
  if (!m.year) return null;
  return Math.floor(m.year / 10) * 10;
}

function cos(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / den; // [-1, 1]
}

function sim01(a: number[], b: number[]) {
  return (1 + cos(a, b)) / 2; // [0, 1]
}

/**
 * MMR selection on FEEL vectors inside a strong frontier.
 * Keeps "integrity" (high RecScore) but reduces near-duplicate vibe picks.
 */
function mmrSelect(
  frontier: { m: MovieRecord; b: any }[],
  k: number,
  lambda = 0.86,
  caps?: {
    maxSameDirector?: number;
    maxSameLeadActor?: number;
    maxSameDecade?: number;
  }
) {
  const maxSameDirector = caps?.maxSameDirector ?? 1;
  const maxSameLeadActor = caps?.maxSameLeadActor ?? 1;
  const maxSameDecade = caps?.maxSameDecade ?? 3;

  const chosen: { m: MovieRecord; b: any }[] = [];
  const remaining = [...frontier];

  const directorCounts = new Map<number, number>();
  const actorCounts = new Map<number, number>();
  const decadeCounts = new Map<number, number>();

  while (chosen.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const m = item.m;

      const d = directorKey(m);
      if (d && (directorCounts.get(d) ?? 0) >= maxSameDirector) continue;

      const a = leadActorKey(m);
      if (a && (actorCounts.get(a) ?? 0) >= maxSameLeadActor) continue;

      const dec = decadeKey(m);
      if (dec && (decadeCounts.get(dec) ?? 0) >= maxSameDecade) continue;

      let redundancy = 0;
      for (const picked of chosen) {
        redundancy = Math.max(redundancy, sim01(m.feelVec, picked.m.feelVec));
      }

      const base = item.b.RecScore;
      const val = lambda * base - (1 - lambda) * redundancy;

      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    const picked = remaining[bestIdx];
    chosen.push(picked);
    remaining.splice(bestIdx, 1);

    const d = directorKey(picked.m);
    if (d) directorCounts.set(d, (directorCounts.get(d) ?? 0) + 1);

    const a = leadActorKey(picked.m);
    if (a) actorCounts.set(a, (actorCounts.get(a) ?? 0) + 1);

    const dec = decadeKey(picked.m);
    if (dec) decadeCounts.set(dec, (decadeCounts.get(dec) ?? 0) + 1);
  }

  return chosen;
}

export async function GET(req: NextRequest) {
  try {
    const tmdbId = Number(req.nextUrl.searchParams.get("tmdbId"));
    if (!tmdbId) return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });

    const personalize = req.nextUrl.searchParams.get("personalize") === "1";
    const userId = req.nextUrl.searchParams.get("userId") || "default";

    const seed = await ensureInCache(tmdbId);

    // --- Candidate generation (true multi-lane) ---
    const cached = getAllMovies().filter((m) => m.tmdbId !== seed.tmdbId);

    // Feel neighbors from cache (reservoir)
    const feelNeighbors = cached
      .map((m) => ({ m, sim: recV2Breakdown(seed, m).FeelSim }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 140)
      .map((x) => x.m.tmdbId);

    // World neighbors (TMDB discover by genres/keywords)
    const kw = seed.keywords.slice(0, 8).map((k) => k.id).join("|");
    const gs = seed.genres.slice(0, 4).map((g) => g.id).join(",");

    const worldIds = await tmdbDiscoverIds({
      with_keywords: kw || undefined,
      with_genres: gs || undefined,
      vote_count_gte: 50,
      page: 1
    });

    // Surprise bridge (director-only to reduce acting dominance)
    const topDirector = seed.directors[0]?.id;
    const bridgeIds = uniq([
      ...(topDirector ? await tmdbDiscoverIds({ with_crew: String(topDirector), vote_count_gte: 50, page: 1 }) : [])
    ]);

    // Backfill from TMDB similar/recommendations
    const tmdbBackfill = uniq([...(await tmdbSimilarIds(seed.tmdbId)), ...(await tmdbRecommendIds(seed.tmdbId))]);

    // ✅ True lane picks (don’t let "first 60" be all feel)
    const feelPick = sample(feelNeighbors, 70);
    const worldPick = sample(worldIds, 35);
    const bridgePick = sample(bridgeIds, 20);
    const backfillPick = sample(tmdbBackfill, 35);

    const ensureIds = uniq([...feelPick, ...worldPick, ...bridgePick, ...backfillPick])
      .filter((id) => id !== seed.tmdbId)
      .slice(0, 140);

    // Ensure in cache
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

    // ✅ Diversify inside a strong frontier using MMR on feel
    const frontier = scored.slice(0, 90);
    const top10 = mmrSelect(frontier, 10, 0.86, {
      maxSameDirector: 1,
      maxSameLeadActor: 1,
      maxSameDecade: 3
    });

    // Fill remaining up to 25 with looser caps
    const chosenIds = new Set(top10.map((x) => x.m.tmdbId));
    const remaining = frontier.filter((x) => !chosenIds.has(x.m.tmdbId));
    const fill = mmrSelect(remaining, 15, 0.90, {
      maxSameDirector: 2,
      maxSameLeadActor: 2,
      maxSameDecade: 5
    });

    const finalChosen = [...top10, ...fill];

    // Build output (✅ add reason)
    const out: Recommendation[] = finalChosen.map((s) => ({
      tmdbId: s.m.tmdbId,
      title: s.m.title,
      year: s.m.year,
      poster: s.m.poster,
      directors: s.m.directors.map((x) => x.name).join(", "),
      vote_average: s.m.tmdbVoteAverage,
      vote_count: s.m.tmdbVoteCount,
      reason: oneLineReason(s.b), // ✅ new
      breakdown: s.b
    }));

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
