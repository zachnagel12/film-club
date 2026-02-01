/**
 * FeelEmbedding: overview + tagline only.
 * If OPENAI_API_KEY is set, you can later swap in real embeddings.
 * For now this uses a deterministic hashed bag-of-words vector so the engine works end-to-end.
 */

function normalize(text: string) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && t.length <= 24);
}

function hash32(s: string) {
  // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function feelVectorFromText(overview: string, tagline: string, dim = 256): number[] {
  const tokens = normalize(`${overview}\n${tagline}`);
  const v = new Array(dim).fill(0);
  for (const t of tokens) {
    const h = hash32(t);
    const idx = h % dim;
    const sign = (h & 1) === 0 ? 1 : -1;
    v[idx] += sign * 1;
  }
  // L2 normalize
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
