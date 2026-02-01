import { NextRequest, NextResponse } from "next/server";
import { getMovie, getOrCreateUser, saveUser } from "../../../../lib/cache";
import { cosine } from "../../../../lib/embeddings";

function addVec(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  const out = a.slice();
  for (let i = 0; i < n; i++) out[i] += b[i];
  return out;
}

function scaleVec(a: number[], s: number) {
  return a.map((x) => x * s);
}

function normVec(a: number[]) {
  let n = 0;
  for (const x of a) n += x * x;
  n = Math.sqrt(n) || 1;
  return a.map((x) => x / n);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = String(body.userId || "default");
    const tmdbId = Number(body.tmdbId);
    const rating = Number(body.rating); // 0..10

    if (!tmdbId || Number.isNaN(rating)) {
      return NextResponse.json({ error: "Missing tmdbId or rating" }, { status: 400 });
    }

    const m = getMovie(tmdbId);
    if (!m) return NextResponse.json({ error: "Movie not ingested yet" }, { status: 400 });

    const u = getOrCreateUser(userId);

    // Update feel centroid (simple running average)
    const n = u.ratingsCount;
    const w = 1 / (n + 1);
    const prev = u.feelCentroid || new Array(m.feelVec.length).fill(0);
    const next = addVec(scaleVec(prev, 1 - w), scaleVec(m.feelVec, w));
    u.feelCentroid = normVec(next);

    // Affinities (shrunk-ish): add small positive signal when rating is high
    const signal = Math.max(-1, Math.min(1, (rating - 6.5) / 3.5)); // ~[-1..1]
    const d = m.directors[0]?.name;
    if (d) u.dirAff[d] = (u.dirAff[d] ?? 0) * 0.9 + 0.1 * signal;

    for (const c of m.castTop.slice(0, 3)) {
      u.castAff[c.name] = (u.castAff[c.name] ?? 0) * 0.9 + 0.1 * signal;
    }

    if (m.year) {
      const decade = String(Math.floor(m.year / 10) * 10);
      u.decadeAff[decade] = (u.decadeAff[decade] ?? 0) * 0.9 + 0.1 * signal;
    }

    u.ratingsCount = n + 1;
    saveUser(u);

    return NextResponse.json({
      ok: true,
      ratingsCount: u.ratingsCount,
      tasteFeelSimSelf: u.feelCentroid ? (1 + cosine(u.feelCentroid, m.feelVec)) / 2 : 0.5
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
