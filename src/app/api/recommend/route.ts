import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tmdbId = searchParams.get("tmdbId");

  if (!tmdbId) {
    return NextResponse.json(
      { error: "tmdbId required" },
      { status: 400 }
    );
  }

  // 🚧 STUB — replace with your v2 engine next
  return NextResponse.json({
    recommendations: [
      { id: 1, title: "Black Swan", year: 2010 },
      { id: 2, title: "Birdman", year: 2014 },
      { id: 3, title: "The Social Network", year: 2010 },
      { id: 4, title: "Sound of Metal", year: 2019 },
      { id: 5, title: "Nightcrawler", year: 2014 },
    ],
  });
}
