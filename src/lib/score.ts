import type { MovieRecord, RecBreakdown } from "./types";
import { cosine } from "./embeddings";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export function feelSim(seed: MovieRecord, cand: MovieRecord) {
  return (1 + cosine(seed.feelVec, cand.feelVec)) / 2;
}

export function worldSim(seed: MovieRecord, cand: MovieRecord) {
  const s = new Set<string>([
    ...seed.genres.map((g) => `g:${g.id}`),
    ...seed.keywords.map((k) => `k:${k.id}`)
  ]);
  const c = new Set<string>([
    ...cand.genres.map((g) => `g:${g.id}`),
    ...cand.keywords.map((k) => `k:${k.id}`)
  ]);
  let inter = 0;
  for (const x of s) if (c.has(x)) inter++;
  const union = s.size + c.size - inter;
  return union ? inter / union : 0;
}

export function runtimeSim(seed: MovieRecord, cand: MovieRecord) {
  if (!seed.runtime || !cand.runtime) return 0.5;
  return clamp01(1 - Math.min(Math.abs(seed.runtime - cand.runtime) / 60, 1));
}

export function decadeFit(seed: MovieRecord, cand: MovieRecord) {
  if (!seed.year || !cand.year) return 0.5;
  return Math.exp(-Math.abs(seed.year - cand.year) / 20);
}

function overlapCount(a: { id: number }[], b: { id: number }[]) {
  const setA = new Set(a.map((x) => x.id));
  let c = 0;
  for (const x of b) if (setA.has(x.id)) c++;
  return c;
}

export function actingSim(seed: MovieRecord, cand: MovieRecord) {
  const shared = overlapCount(seed.castTop.slice(0, 8), cand.castTop.slice(0, 10));
  return clamp01(shared / 3);
}

export function directionSim(seed: MovieRecord, cand: MovieRecord) {
  const directorMatch = overlapCount(seed.directors, cand.directors) > 0 ? 1 : 0;
  const writerOverlap = clamp01(overlapCount(seed.writers, cand.writers) / 2);
  const auteurSignal = clamp01(directorMatch * (0.6 + 0.4 * writerOverlap));
  return clamp01(0.6 * directorMatch + 0.25 * writerOverlap + 0.15 * auteurSignal);
}

/**
 * Quality = sigmoid((BayesIMDb - 6.8)/0.6)
 * If IMDb missing -> 0.5
 *
 * We implement BayesIMDb with C=6.9, m=25k votes.
 */
export function bayesIMDb(rating: number, votes: number, C = 6.9, m = 25000) {
  const v = Math.max(0, votes);
  return (v / (v + m)) * rating + (m / (v + m)) * C;
}

export function qualityScore(cand: MovieRecord) {
  const r = cand.imdb?.rating;
  const v = cand.imdb?.votes;
  if (typeof r === "number" && typeof v === "number") {
    const b = bayesIMDb(r, v);
    return sigmoid((b - 6.8) / 0.6);
  }
  // fallback if no IMDb yet: neutral
  return 0.5;
}

/**
 * StyleSim = 0.60*RuntimeSim + 0.40*StyleEmbeddingSim
 * We keep styleVec; for now you can set styleVec = feelVec on ingest.
 */
export function styleSim(seed: MovieRecord, cand: MovieRecord) {
  const rt = runtimeSim(seed, cand);
  const styleEmb = (1 + cosine(seed.styleVec, cand.styleVec)) / 2;
  return 0.6 * rt + 0.4 * styleEmb;
}

/**
 * RecScore_v2 weights (exact):
 * 0.60 FeelSim
 * 0.15 DirectionSim
 * 0.10 StyleSim
 * 0.07 DecadeFit
 * 0.05 ActingSim
 * 0.03 Quality
 * 0.05 WorldSim
 */
export function recV2Breakdown(seed: MovieRecord, cand: MovieRecord): RecBreakdown {
  const FeelSim = feelSim(seed, cand);
  const DirectionSim = directionSim(seed, cand);
  const StyleSim = styleSim(seed, cand);
  const DecadeFit = decadeFit(seed, cand);
  const ActingSim = actingSim(seed, cand);
  const Quality = qualityScore(cand);
  const WorldSim = worldSim(seed, cand);

  const RecScore =
    0.60 * FeelSim +
    0.15 * DirectionSim +
    0.10 * StyleSim +
    0.07 * DecadeFit +
    0.05 * ActingSim +
    0.03 * Quality +
    0.05 * WorldSim;

  return { RecScore, FeelSim, DirectionSim, StyleSim, DecadeFit, ActingSim, Quality, WorldSim };
}
