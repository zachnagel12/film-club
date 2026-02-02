// lib/reason.ts
import type { MovieRecord, RecBreakdown } from "./types";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function intersectById<T extends { id: number }>(a: T[], b: T[]) {
  const bs = new Set(b.map((x) => x.id));
  return a.filter((x) => bs.has(x.id));
}

function pickTopNames<T extends { name: string }>(xs: T[], n: number) {
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

/**
 * Mirrors your RecScore weights, but keeps Acting small
 * (since you want it less important AND less prominent in explanations).
 */
const WEIGHTS = {
  FeelSim: 0.60,
  DirectionSim: 0.15,
  StyleSim: 0.10,
  DecadeFit: 0.07,
  ActingSim: 0.01,
  Quality: 0.03,
  WorldSim: 0.05
} as const;

type Key = keyof typeof WEIGHTS;

function topDriver(b: RecBreakdown): Key {
  const entries = (Object.keys(WEIGHTS) as Key[]).map((k) => ({
    key: k,
    score: WEIGHTS[k] * clamp01((b as any)[k] ?? 0),
    raw: (b as any)[k] ?? 0
  }));
  entries.sort((a, c) => c.score - a.score);

  const top = entries[0];
  const second = entries[1];

  // Avoid “Quality” as headline unless it’s clearly dominant
  if (top.key === "Quality" && second && second.score > top.score * 0.85) return second.key;

  // Avoid acting as headline unless it is clearly dominant
  if (top.key === "ActingSim" && second && second.score > top.score * 0.70) return second.key;

  // If FeelSim is very high, prefer feel as driver (users expect vibe match)
  if ((b.FeelSim ?? 0) >= 0.82) return "FeelSim";

  return top.key;
}

/**
 * Returns a *specific* one-liner reason:
 * - Selects a primary driver (feel / direction / style / world / decade)
 * - Adds concrete evidence (names, overlaps, diffs) to prevent repetitive copy.
 */
export function oneLineReasonSpecific(seed: MovieRecord, cand: MovieRecord, b: RecBreakdown): string {
  const driver = topDriver(b);

  const sharedGenres = intersectById(seed.genres, cand.genres);
  const sharedKeywords = intersectById(seed.keywords, cand.keywords);
  const sharedDirectors = intersectById(seed.directors, cand.directors);
  const sharedWriters = intersectById(seed.writers, cand.writers);
  const sharedCastTop = intersectById(seed.castTop, cand.castTop);

  const rtDiff = minutesDiff(seed.runtime, cand.runtime);
  const yDiff = yearDiff(seed.year, cand.year);

  const topKw = pickTopNames(sharedKeywords, 2);
  const topGenres = pickTopNames(sharedGenres, 2);

  // Helper snippets (only include if available)
  const kwSnippet = topKw.length ? `themes: ${topKw.join(" • ")}` : null;
  const genreSnippet = topGenres.length ? `genres: ${topGenres.join(" • ")}` : null;
  const paceSnippet = rtDiff != null ? `runtime within ${rtDiff} min` : null;
  const eraSnippet = yDiff != null ? `${yDiff} years apart` : null;

  const directorName = sharedDirectors[0]?.name ?? null;
  const writerName = sharedWriters[0]?.name ?? null;
  const actorName = sharedCastTop[0]?.name ?? null;

  // Build specific one-liners by driver
  switch (driver) {
    case "DirectionSim": {
      if (directorName) return `Similar directing signature (same director: ${directorName})`;
      if (writerName) return `Similar authorship (shared writer: ${writerName})`;
      // fallback to “auteur-ish” evidence
      if (genreSnippet) return `Similar directing approach • ${genreSnippet}`;
      return `Similar directing / auteur signature`;
    }

    case "StyleSim": {
      const parts = uniq([paceSnippet, genreSnippet, kwSnippet].filter(Boolean) as string[]);
      if (parts.length) return `Similar pacing & style • ${parts[0]}`;
      return `Similar pacing, rhythm, and style`;
    }

    case "WorldSim": {
      const parts = uniq([kwSnippet, genreSnippet].filter(Boolean) as string[]);
      if (parts.length) return `Similar themes & world • ${parts[0]}`;
      return `Similar themes, genres, or motifs`;
    }

    case "DecadeFit": {
      const parts = uniq([eraSnippet, genreSnippet, kwSnippet].filter(Boolean) as string[]);
      if (parts.length) return `Similar era & storytelling • ${parts[0]}`;
      return `Similar era and storytelling conventions`;
    }

    case "ActingSim": {
      // You asked for acting to matter less; keep this as a rare fallback with specifics.
      if (actorName) return `Similar performance energy (shared top-billed: ${actorName})`;
      return `Similar performance style`;
    }

    case "Quality": {
      // Keep it concrete but not repetitive
      if (kwSnippet) return `High-confidence pick • ${kwSnippet}`;
      return `High-confidence pick (strong overall reception)`;
    }

    case "FeelSim":
    default: {
      // Feel should still be specific: attach *what* overlaps support the vibe
      const support = uniq([kwSnippet, genreSnippet, paceSnippet].filter(Boolean) as string[]);
      if (support.length) return `Matches the vibe & emotional intensity • ${support[0]}`;
      return `Matches the vibe & emotional intensity`;
    }
  }
}
