import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "../../../../lib/cache";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "default";
  const u = getOrCreateUser(userId);
  return NextResponse.json({
    userId: u.userId,
    ratingsCount: u.ratingsCount
  });
}
