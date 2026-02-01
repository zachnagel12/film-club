import type { MovieRecord } from "./types";
import { cosine } from "./embeddings";
import { qualityScore } from "./score";

export function betaFromRatingsCount(n: number) {
  // β(n)=0.15+0.45·(1−e^{−n/30})
  return 0.15 + 0.45 * (1 - Math.exp(-n / 30));
}

export function tasteScore(u: {
  feelCentroid: number[] | null;
  dirAff: Record<string, number>;
  castAff: Record<string, number>;
  decadeAff: Record<string, number>;
}, m: MovieRecord) {
  const TasteFeelSim = u.feelCentroid ? (1 + cosine(u.feelCentroid, m.feelVec)) / 2 : 0.5;

  const topDir = m.directors[0]?.name || "";
  const DirAff = topDir ? (u.dirAff[topDir] ?? 0) : 0;

  const topCast = m.castTop.slice(0, 3).map((c) => c.name);
  const ActingAff = topCast.length
    ? topCast.reduce((acc, name) => acc + (u.castAff[name] ?? 0), 0) / topCast.length
    : 0;

  const decadeKey = m.year ? String(Math.floor(m.year / 10) * 10) : "";
  const DecadeAff = decadeKey ? (u.decadeAff[decadeKey] ?? 0) : 0;

  const Quality = qualityScore(m);

  return 0.65 * TasteFeelSim + 0.15 * DirAff + 0.08 * ActingAff + 0.07 * DecadeAff + 0.05 * Quality;
}

export function rerankPersonal(
  base: { tmdbId: number; baseScore: number }[],
  moviesById: Map<number, MovieRecord>,
  user: {
    ratingsCount: number;
    feelCentroid: number[] | null;
    dirAff: Record<string, number>;
    castAff: Record<string, number>;
    decadeAff: Record<string, number>;
  }
) {
  const b = betaFromRatingsCount(user.ratingsCount);
  return base
    .map((x) => {
      const m = moviesById.get(x.tmdbId);
      if (!m) return { ...x, score: x.baseScore };
      const t = tasteScore(user, m);
      const score = (1 - b) * x.baseScore + b * t;
      return { ...x, score };
    })
    .sort((a, b) => b.score - a.score);
}
