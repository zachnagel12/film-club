import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await prisma.user.deleteMany();
    return NextResponse.json({
      deleted: result.count,
    });
  } catch (err) {
    console.error("WIPE USERS ERROR:", err);
    return NextResponse.json(
      { error: "Failed to wipe users" },
      { status: 500 }
    );
  }
}
