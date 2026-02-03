import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is missing in environment variables" },
      { status: 500 }
    );
  }

  const url =
    `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}` +
    `&include_adult=false&language=en-US&page=1`;

  const tmdbRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    // prevent caching issues while iterating
    cache: "no-store",
  });

  const data = await tmdbRes.json();

  if (!tmdbRes.ok) {
    return NextResponse.json(
      { error: data?.status_message || "TMDB error" },
      { status: tmdbRes.status }
    );
  }

  return NextResponse.json({ results: data.results || [] });
}
