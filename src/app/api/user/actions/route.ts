// app/api/user/actions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUserActions, toggleUserSaved, toggleUserDisliked } from "../../../../lib/cache";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "default";
  const actions = getUserActions(userId);
  return NextResponse.json({ actions });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const userId = String(body.userId || "default");
  const tmdbId = Number(body.tmdbId);
  const action = String(body.action || "");

  if (!tmdbId || !action) {
    return NextResponse.json({ error: "Missing tmdbId/action" }, { status: 400 });
  }

  if (action === "save") {
    const u = toggleUserSaved(userId, tmdbId);
    return NextResponse.json({ actions: u.actions });
  }

  if (action === "dislike") {
    const u = toggleUserDisliked(userId, tmdbId);
    return NextResponse.json({ actions: u.actions });
  }

  return NextResponse.json({ error: "Invalid action (use 'save' or 'dislike')" }, { status: 400 });
}
