import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) return NextResponse.json({ results: [] });

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is missing" },
      { status: 500 }
    );
  }

  const url =
    `https://api.themoviedb.org/3/search/movie` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(q)}` +
    `&include_adult=false&language=en-US&page=1`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.status_message || "TMDB error" },
      { status: res.status }
    );
  }

  return NextResponse.json({ results: data.results || [] });
}
