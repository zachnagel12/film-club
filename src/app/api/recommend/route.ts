import { NextResponse } from "next/server";
import {
  tmdbGet,
  tmdbFetchFull,
  type TmdbMovie,
  yearFromDate,
  pickDirectorId,
  topCastIds,
  genreIds,
  keywordIds,
} from "@/lib/tmdb";

export const runtime = "nodejs";

// --------------------
// tiny “feel embedding” stand-in (overview+tagline cosine)
// --------------------
function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// hashing-trick vector
function textVector(s: string, dims = 256) {
  const v = new Array(dims).fill(0);
  const toks = tokenize(s);
  for (const t of toks) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    v[h % dims] += 1;
  }
  // L2 normalize
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // already normalized
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function jaccard(a: number[], b: number[]) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function decadeFit(yA?: number, yB?: number) {
  if (!yA || !yB) return 0.5;
  const d = Math.abs(yA - yB);
  return Math.exp(-d / 20);
}

function runtimeSim(rA?: number | null, rB?: number | null) {
  if (!rA || !rB) return 0.5;
  const d = Math.abs(rA - rB);
  return 1 - Math.min(d / 60, 1);
}

// v2-like scoring with stand-ins where needed
function scoreCandidate(seed: TmdbMovie, cand: TmdbMovie) {
  const seedText = `${seed.overview || ""} ${seed.tagline || ""}`.trim();
  const candText = `${cand.overview || ""} ${cand.tagline || ""}`.trim();

  const feelSim =
    seedText && candText
      ? (1 + cosine(textVector(seedText), textVector(candText))) / 2
      : 0.5;

  const seedDir = pickDirectorId(seed);
  const candDir = pickDirectorId(cand);
  const directorMatch = seedDir && candDir && seedDir === candDir ? 1 : 0;

  const seedCast = topCastIds(seed, 8);
  const candCast = topCastIds(cand, 8);
  const sharedCast = candCast.filter((id) => seedCast.includes(id)).length;
  const actingSim = clamp01(sharedCast / 3);

  const yA = yearFromDate(seed.release_date);
  const yB = yearFromDate(cand.release_date);

  const dFit = decadeFit(yA, yB);
  const rSim = runtimeSim(seed.runtime, cand.runtime);

  const worldSim = jaccard(
    [...genreIds(seed), ...keywordIds(seed)],
    [...genreIds(cand), ...keywordIds(cand)]
  );

  // Quality proxy (TMDB rating + vote_count confidence)
  const va = cand.vote_average ?? 6.5;
  const vc = cand.vote_count ?? 0;
  const conf = clamp01(vc / 1500);
  const quality = clamp01(sigmoid((va - 6.8) / 0.6) * (0.6 + 0.4 * conf));

  // DirectionSim simplified to DirectorMatch only; StyleSim runtime-only
  const directionSim = directorMatch;
  const styleSim = rSim;

  const recScore =
    0.60 * feelSim +
    0.15 * directionSim +
    0.10 * styleSim +
    0.07 * dFit +
    0.05 * actingSim +
    0.03 * quality +
    0.05 * worldSim;

  const reasons: string[] = [];
  if (feelSim > 0.78) reasons.push("Similar vibe (overview/tagline)");
  if (directorMatch === 1) reasons.push("Same director");
  if (actingSim > 0) reasons.push(`Shared cast (${Math.min(sharedCast, 3)}+)`);
  if (dFit > 0.75) reasons.push("Close release era");
  if (worldSim > 0.25) reasons.push("Genre/keyword overlap");
  if (quality > 0.75) reasons.push("High audience signal");

  return {
    recScore,
    reasons,
  };
}

type TmdbListResp = { results: { id: number }[] };

async function fetchCandidates(seed: TmdbMovie) {
  const seedId = seed.id;

  // 1) TMDB rec/similar
  const [recs, sims] = await Promise.all([
    tmdbGet<TmdbListResp>(`/movie/${seedId}/recommendations`, {
      language: "en-US",
      page: 1,
    }),
    tmdbGet<TmdbListResp>(`/movie/${seedId}/similar`, {
      language: "en-US",
      page: 1,
    }),
  ]);

  // 2) World glue discover by top genres/keywords
  const g = (seed.genres || []).slice(0, 2).map((x) => x.id);
  const kw = (seed.keywords?.keywords || []).slice(0, 3).map((x) => x.id);

  const discover = await tmdbGet<TmdbListResp>(`/discover/movie`, {
    language: "en-US",
    sort_by: "popularity.desc",
    include_adult: false,
    page: 1,
    with_genres: g.length ? g.join(",") : undefined,
    with_keywords: kw.length ? kw.join(",") : undefined,
  });

  // 3) Surprise bridge: director + lead actor
  const dirId = pickDirectorId(seed);
  const leadActor = (seed.credits?.cast || [])
    .slice()
    .sort((a, b) => a.order - b.order)[0]?.id;

  const bridge = await tmdbGet<TmdbListResp>(`/discover/movie`, {
    language: "en-US",
    sort_by: "popularity.desc",
    include_adult: false,
    page: 1,
    with_people: [dirId, leadActor].filter(Boolean).join(",") || undefined,
  });

  // Combine + dedupe IDs, exclude seed
  const ids = new Set<number>();
  for (const arr of [recs.results, sims.results, discover.results, bridge.results]) {
    for (const m of arr) {
      if (!m?.id) continue;
      if (m.id === seedId) continue;
      ids.add(m.id);
    }
  }

  // Limit to avoid timeouts
  return Array.from(ids).slice(0, 60);
}

function posterPathFromMovie(m: TmdbMovie): string | null {
  // poster_path isn't in your TmdbMovie type definition, so read defensively
  const p = (m as any)?.poster_path as string | undefined | null;
  return p || null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbIdStr = searchParams.get("tmdbId");
    const tmdbId = tmdbIdStr ? Number(tmdbIdStr) : NaN;

    if (!Number.isFinite(tmdbId)) {
      return NextResponse.json({ error: "tmdbId required" }, { status: 400 });
    }

    // Seed (full)
    const seed = await tmdbFetchFull(tmdbId);

    // Candidate IDs
    const candidateIds = await fetchCandidates(seed);

    // Fetch full data for candidates
    const candidates = await Promise.all(candidateIds.map((id) => tmdbFetchFull(id)));

    // Score + sort
    const scored = candidates
      .map((c) => {
        const s = scoreCandidate(seed, c);
        const poster_path = posterPathFromMovie(c);

        return {
          id: c.id,
          title: c.title,
          year: yearFromDate(c.release_date),
          recScore: Number(s.recScore.toFixed(4)),
          reasons: s.reasons.slice(0, 3),

          // ✅ Posters for frontend
          poster_path,
          poster: poster_path, // same thing; your UI checks r.poster too
        };
      })
      .sort((a, b) => b.recScore - a.recScore);

    // Diversity: max 2 same director in top 10
    const top: typeof scored = [];
    const dirCounts = new Map<number, number>();

    for (const r of scored) {
      if (top.length >= 10) break;

      const full = candidates.find((c) => c.id === r.id);
      const d = full ? pickDirectorId(full) : undefined;

      if (d) {
        const n = dirCounts.get(d) || 0;
        if (n >= 2) continue;
        dirCounts.set(d, n + 1);
      }

      top.push(r);
    }

    return NextResponse.json({
      seed: { id: seed.id, title: seed.title, year: yearFromDate(seed.release_date) },
      recommendations: top,
    });
  } catch (err: any) {
    console.error("RECOMMEND ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate recommendations" },
      { status: 500 }
    );
  }
}
