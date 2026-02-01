import { NextRequest, NextResponse } from "next/server";
import { tmdbSearch } from "../../../../lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) return NextResponse.json({ results: [] });
    const results = await tmdbSearch(q);
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
