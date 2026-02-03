import { NextResponse } from "next/server";
import {
  TmdbMovie,
  tmdbGet,
  yearFromDate,
  pickDirectorId,
  topCastIds,
  genreIds,
  keywordIds,
} from "@/lib/tmdb";

export const runtime = "nodejs";

// --------------------
// tiny “feel embedding” stand-in (overview+tagline text cosine)
// --------------------
function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// hashing trick vector
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

function jaccard(a: number[], b: number[]) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
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

  const feelSim = seedText && candText ? (1 + cosine(textVector(seedText), textVector(candText))) / 2 : 0.5;

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

  /
