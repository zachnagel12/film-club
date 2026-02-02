import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "../../../../lib/cache";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "default";
  const u = getOrCreateUser(userId);

  // Backwards-compatible fields for old UI/code that expects userId + ratingsCount
  const ratingsCount =
    (u as any).ratingsCount ??
    (u as any).ratings?.length ??
    0;

  return NextResponse.json({
    userId: (u as any).userId ?? u.id, // ✅ supports both old + new
    id: u.id,
    ratingsCount,
    actions: u.actions ?? { saved: [], disliked: [] }
  });
}

