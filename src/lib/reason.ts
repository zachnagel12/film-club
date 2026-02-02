import type { MovieRecord, RecBreakdown } from "./types";

function intersectById<T extends { id: number; name: string }>(a: T[], b: T[]) {
  const bs = new Set(b.map((x) => x.id));
  return a.filter((x) => bs.has(x.id));
}

function topNames(xs: { name: string }[], n: number) {
  return xs.slice(0, n).map((x) => x.name);
}

function minutesDiff(a: number | null, b: number | null) {
  if (!a || !b) return null;
  return Math.abs(a - b);
}

function yearDiff(a: number | null, b: number | null) {
  if (!a || !b) return null;
  return Math.abs(a - b);
}

const WEIGHTS = {
  FeelSim: 0.60,
  DirectionSim: 0.15,
  StyleSim: 0.10,
  DecadeFit: 0.07,
  ActingSim: 0.01, // de-emphasize
  Quality: 0.03,
  WorldSim: 0.05
} as const;

type Key = keyof typeof WEIGHTS;

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function topDriver(b: RecBreakdown): Key {
  const entries = (Object.keys(WEIGHTS) as Key[]).map((k) => ({
    k,
    score: WEIGHTS[k] * clamp01((b as any)[k] ?? 0)
  }));
  entries.sort((a, c) => c.score - a.score);

  const top = entries[0]?.k ?? "FeelSim";
  const second = entries[1]?.k;

  if (top === "Quality" && second) return second;
  if (top === "ActingSim" && second) return second;
  if ((b.FeelSim ?? 0) >= 0.82) return "FeelSim";
  return top;
}

export function buildReason(seed: MovieRecord, cand: MovieRecord, b: RecBreakdown): {
  reason: string;
  details: string[];
} {
  const driver = topDriver(b);

  const sharedGenres = intersectById(seed.genres, cand.genres);
  const sharedKeywords = intersectById(seed.keywords, cand.keywords);
  const sharedDirectors = intersectById(seed.directors, cand.directors);
  const sharedWriters = intersectById(seed.writers, cand.writers);
  const sharedCast = intersectById(seed.castTop, cand.castTop);

  const rt = minutesDiff(seed.runtime, cand.runtime);
  const yd = yearDiff(seed.year, cand.year);

  const g = topNames(sharedGenres, 3);
  const k = topNames(sharedKeywords, 4);

  const details: string[] = [];

  if (sharedDirectors[0]?.name) details.push(`Same director: ${sharedDirectors[0].name}`);
  if (sharedWriters[0]?.name) details.push(`Shared writer: ${sharedWriters[0].name}`);
  if (sharedCast[0]?.name) details.push(`Shared top-billed: ${sharedCast[0].name}`);

  if (g.length) details.push(`Genres overlap: ${g.join(" • ")}`);
  if (k.length) details.push(`Themes/keywords overlap: ${k.join(" • ")}`);

  if (rt != null) details.push(`Runtime close: within ${rt} min`);
  if (yd != null) details.push(`Era close: ${yd} years apart`);

  // Keep details short + concrete
  const pickedDetails = details.slice(0, 4);

  // One-liner varies by driver, but stays evidence-based
  let reason = "Similar overall feel";

  if (driver === "DirectionSim") {
    reason = sharedDirectors[0]?.name
      ? `Similar directing signature (same director: ${sharedDirectors[0].name})`
      : `Similar directing / auteur signature`;
  } else if (driver === "StyleSim") {
    reason = rt != null ? `Similar pacing & rhythm (runtime within ${rt} min)` : `Similar pacing, rhythm, and style`;
  } else if (driver === "WorldSim") {
    reason = k.length ? `Similar themes & world (${k.slice(0, 2).join(" • ")})` : `Similar themes, genres, or motifs`;
  } else if (driver === "DecadeFit") {
    reason = yd != null ? `Similar era (${yd} years apart)` : `Similar era and storytelling conventions`;
  } else {
    // FeelSim default
    reason = k.length
      ? `Matches the vibe & emotional intensity (${k.slice(0, 2).join(" • ")})`
      : `Matches the vibe & emotional intensity`;
  }

  return { reason, details: pickedDetails };
}
