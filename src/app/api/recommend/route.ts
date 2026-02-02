import { NextRequest, NextResponse } from "next/server";
import { getAllMovies, getMovie, upsertMovie, getOrCreateUser, getUserActions } from "../../../lib/cache";
import { recV2Breakdown } from "../../../lib/score";
import type { MovieRecord, Recommendation } from "../../../lib/types";
import {
  tmdbDiscoverIds,
  tmdbFetchFull,
  tmdbRecommendIds,
  tmdbSimilarIds,
  buildMovieRecordBase
} from "../../../lib/tmdb";
import { feelVectorFromText } from "../../../lib/embeddings";
import { rerankPersonal } from "../../../lib/personalize";
import { buildReason } from "../../../lib/reason";

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/**
 * Random sample from an array (cheap shuffle then slice).
 * Helps diversify ensured cache so you don't always ingest the same lane.
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
  const styleVec = feelVec; // TODO: replace w/ true style embedding later

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
  return dot / den;
}

function sim01(a: number[], b: number[]) {
  return (1 + cos(a, b)) / 2;
}

/**
 * Mood bias (small, additive).
 * Keeps integrity: still mostly your RecScore, just nudged.
 */
function moodAdjustedScore(b: any, mood: string) {
  let score = b.RecScore;

  switch (mood) {
    case "intense":
      score += 0.04 * b.FeelSim + 0.02 * b.StyleSim;
      break;
    case "thoughtful":
      score += 0.03 * b.DirectionSim + 0.02 * b.WorldSim;
      break;
    case "comfort":
      score += 0.03 * b.WorldSim + 0.02 * b.DecadeFit;
      break;
    case "high-energy":
      score += 0.04 * b.StyleSim + 0.01 * b.FeelSim;
      break;
    default:
      break;
  }

  return score;
}

/**
 * MMR selection on FEEL vectors.
 * Uses item.adj as relevance if present, otherwise RecScore.
 */
function mmrSelect(
  frontier: { m: MovieRecord; b: any; adj?: number }[],
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

  const chosen: { m: MovieRecord; b: any; adj?: number }[] = [];
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

      const base = item.adj ?? item.b.RecScore;
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
    const mood = req.nextUrl.searchParams.get("mood") || "default";

    // Ensure user exists (for personalization + actions)
    getOrCreateUser(userId);

    const actions = getUserActions(userId);
    const dislikedSet = new Set(actions.disliked ?? []);

    const seed = await ensureInCache(tmdbId);

    // --- Candidate generation (multi-lane) ---
    const cached = getAllMovies().filter((m) => m.tmdbId !== seed.tmdbId);

    // 1) feel neighbors (cached)
    const feelNeighbors = cached
      .map((m) => ({ m, sim: recV2Breakdown(seed, m).FeelSim }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 160)
      .map((x) => x.m.tmdbId);

    // 2) world neighbors (TMDB discover by genres/keywords)
    const kw = seed.keywords.slice(0, 8).map((k) => k.id).join("|");
    const gs = seed.genres.slice(0, 4).map((g) => g.id).join(",");

    const worldIds = await tmdbDiscoverIds({
      with_keywords: kw || undefined,
      with_genres: gs || undefined,
      vote_count_gte: 50,
      page: 1
    });

    // 3) bridge (director-only; keeps acting from dominating)
    const topDirector = seed.directors[0]?.id;
    const bridgeIds = uniq([
      ...(topDirector ? await tmdbDiscoverIds({ with_crew: String(topDirector), vote_count_gte: 50, page: 1 }) : [])
    ]);

    // 4) tmdb backfill
    const tmdbBackfill = uniq([...(await tmdbSimilarIds(seed.tmdbId)), ...(await tmdbRecommendIds(seed.tmdbId))]);

    // Lane samples
    const feelPick = sample(feelNeighbors, 70);
    const worldPick = sample(worldIds, 35);
    const bridgePick = sample(bridgeIds, 20);
    const backfillPick = sample(tmdbBackfill, 35);

    // Combined pool, filter disliked + seed
    const ensureIds = uniq([...feelPick, ...worldPick, ...bridgePick, ...backfillPick])
      .filter((id) => id !== seed.tmdbId && !dislikedSet.has(id))
      .slice(0, 160);

    // Ensure in cache
    const ensured: MovieRecord[] = [];
    for (const id of ensureIds) {
      try {
        ensured.push(await ensureInCache(id));
      } catch {
        // skip failures
      }
    }

    const ensuredFiltered = ensured.filter((m) => m.tmdbId !== seed.tmdbId && !dislikedSet.has(m.tmdbId));

    // Score (+ mood adjust)
    const scored = ensuredFiltered
      .map((m) => {
        const b = recV2Breakdown(seed, m);
        const adj = moodAdjustedScore(b, mood);
        return { m, b, adj };
      })
      .sort((a, b) => b.adj - a.adj);

    // MMR diversify in a strong frontier
    const frontier = scored.slice(0, 90);

    const top10 = mmrSelect(frontier, 10, 0.86, {
      maxSameDirector: 1,
      maxSameLeadActor: 1,
      maxSameDecade: 3
    });

    // Fill remaining to 25 with looser caps
    const chosenIds = new Set(top10.map((x) => x.m.tmdbId));
    const remaining = frontier.filter((x) => !chosenIds.has(x.m.tmdbId));

    const fill = mmrSelect(remaining, 15, 0.90, {
      maxSameDirector: 2,
      maxSameLeadActor: 2,
      maxSameDecade: 5
    });

    const finalChosen = [...top10, ...fill];

    // Output with specific reasons + details
    const out: Recommendation[] = finalChosen.map((s) => {
      const rr = buildReason(seed, s.m, s.b);
      return {
        tmdbId: s.m.tmdbId,
        title: s.m.title,
        year: s.m.year,
        poster: s.m.poster,
        directors: s.m.directors.map((x) => x.name).join(", "),
        vote_average: s.m.tmdbVoteAverage,
        vote_count: s.m.tmdbVoteCount,
        reason: rr.reason,
        reasonDetails: rr.details,
        breakdown: s.b
      };
    });

    // Optional personalization rerank (uses your existing function)
    if (personalize) {
      const user = getOrCreateUser(userId);
      const moviesById = new Map(ensuredFiltered.map((m) => [m.tmdbId, m]));
      const base = out.map((r) => ({ tmdbId: r.tmdbId, baseScore: r.breakdown.RecScore }));
      const reranked = rerankPersonal(base, moviesById, user as any);

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
