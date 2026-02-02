import { NextRequest, NextResponse } from "next/server";
import { getAllMovies, getMovie, upsertMovie, getOrCreateUser } from "../../../lib/cache";
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

/**
 * Utilities
 */
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function sample<T>(arr: T[], n: number) {
  // Fisher-Yates shuffle-slice
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

function clampTop<T>(arr: T[], n: number) {
  return arr.slice(0, Math.max(0, n));
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
  return dot / den; // [-1,1]
}

function sim01(a: number[], b: number[]) {
  // cosine mapped to [0,1]
  return (1 + cos(a, b)) / 2;
}

/**
 * Cache ingest
 */
async function ensureInCache(tmdbId: number) {
  const existing = getMovie(tmdbId);
  if (existing) return existing;

  const full = await tmdbFetchFull(tmdbId);
  const base = buildMovieRecordBase({ tmdbId, full });

  // Feel vector based on your feel-focused embedding method
  const feelVec = feelVectorFromText(base.overview, base.tagline, 256);

  // NOTE: keeping styleVec here, but do NOT mirror feelVec long-term.
  // If you don’t have style embeddings yet, set to null/undefined or keep as feelVec.
  // For now: keep as feelVec to avoid breaking downstream code.
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

/**
 * Keys for diversity controls
 */
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

/**
 * MMR selection:
 * Choose items that are high scoring but not redundant in FEEL space.
 * This is the safest way to diversify without "breaking integrity."
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

      // Hard caps (reduce acting dominance + auteur clumping)
      const d = directorKey(m);
      if (d && (directorCounts.get(d) ?? 0) >= maxSameDirector) continue;

      const a = leadActorKey(m);
      if (a && (actorCounts.get(a) ?? 0) >= maxSameLeadActor) continue;

      const dec = decadeKey(m);
      if (dec && (decadeCounts.get(dec) ?? 0) >= maxSameDecade) continue;

      // Redundancy: max similarity to already chosen in feel space
      let redundancy = 0;
      for (const picked of chosen) {
        redundancy = Math.max(redundancy, sim01(m.feelVec, picked.m.feelVec));
      }

      // Base score = your RecScore (already combines feel/style/etc.)
      const base = item.b.RecScore;

      // MMR objective: maximize relevance, penalize redundancy
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

    /**
     * Candidate generation (true 70/20/10 + backfill)
     * IMPORTANT FIX: don’t just concat and take first 60,
     * because that effectively becomes “60 feel neighbors” every time.
     */

    const cached = getAllMovies().filter((m) => m.tmdbId !== seed.tmdbId);

    // FEEL lane: use FeelSim directly for vibe fidelity
    const feelNeighbors = cached
      .map((m) => ({ m, sim: recV2Breakdown(seed, m).FeelSim }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 140) // take more as a reservoir; we'll sample
      .map((x) => x.m.tmdbId);

    // WORLD lane: genres + keywords (theme / topic glue)
    const kw = seed.keywords.slice(0, 8).map((k) => k.id).join("|");
    const gs = seed.genres.slice(0, 4).map((g) => g.id).join(",");

    const worldIds = await tmdbDiscoverIds({
      with_keywords: kw || undefined,
      with_genres: gs || undefined,
      vote_count_gte: 50,
      page: 1
    });

    // BRIDGE lane:
    // To reduce “acting similarity” dominance, prefer director bridge.
    // (cast-based bridge is the biggest “same actor” magnet)
    const topDirector = seed.directors[0]?.id;
    const bridgeIds = uniq([
      ...(topDirector
        ? await tmdbDiscoverIds({ with_crew: String(topDirector), vote_count_gte: 50, page: 1 })
        : [])
    ]);

    // Backfill lane: TMDB similar/recommendations (helps early cache coverage)
    const tmdbBackfill = uniq([...(await tmdbSimilarIds(seed.tmdbId)), ...(await tmdbRecommendIds(seed.tmdbId))]);

    // --- Pick from each lane (weights) ---
    // We ingest more than we need, then rerank + diversify.
    const feelPick = sample(feelNeighbors, 70);
    const worldPick = sample(worldIds, 35);
    const bridgePick = sample(bridgeIds, 20);
    const backfillPick = sample(tmdbBackfill, 35);

    const ensureIds = uniq([
      ...feelPick,
      ...worldPick,
      ...bridgePick,
      ...backfillPick
    ])
      .filter((id) => id !== seed.tmdbId)
      .slice(0, 140);

    // Ensure candidates exist in cache
    const ensured: MovieRecord[] = [];
    for (const id of ensureIds) {
      try {
        ensured.push(await ensureInCache(id));
      } catch {
        // skip failures
      }
    }

    // Score with your RecScore (integrity)
    const scored = ensured
      .map((m) =>  ({ m, b: recV2Breakdown(seed, m) }))
      .sort((a, b) => b.b.RecScore - a.b.RecScore);

    /**
     * Diversify without breaking “vibe”
     * - Work within a strong frontier (top N by RecScore)
     * - Use MMR on FEEL vectors to avoid near-duplicates
     * - Hard caps reduce acting-driven repetition
     */
    const frontier = scored.slice(0, 90);

    // Pick top 10 with diversity caps
    const chosenTop10 = mmrSelect(frontier, 10, 0.86, {
      maxSameDirector: 1,
      maxSameLeadActor: 1,
      maxSameDecade: 3
    });

    // Then fill the rest (up to 25) from remaining by score, looser caps
    const chosenIds = new Set(chosenTop10.map((x) => x.m.tmdbId));
    const remaining = frontier.filter((x) => !chosenIds.has(x.m.tmdbId));

    const fill = mmrSelect(remaining, 15, 0.90, {
      maxSameDirector: 2,
      maxSameLeadActor: 2,
      maxSameDecade: 5
    });

    const finalChosen = [...chosenTop10, ...fill];

    const out: Recommendation[] = finalChosen.map((s) => ({
      tmdbId: s.m.tmdbId,
      title: s.m.title,
      year: s.m.year,
      poster: s.m.poster,
      directors: s.m.directors.map((x) => x.name).join(", "),
      vote_average: s.m.tmdbVoteAverage,
      vote_count: s.m.tmdbVoteCount,
      breakdown: s.b
    }));

    // Optional personalization rerank over SAME candidate pool (keeps integrity)
    if (personalize) {
      const user = getOrCreateUser(userId);
      const moviesById = new Map(ensured.map((m) => [m.tmdbId, m]));

      // IMPORTANT: rerank over the same "out" list only (what you return)
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
