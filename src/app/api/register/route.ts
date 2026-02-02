import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const email = (body?.email ?? "").toLowerCase().trim();
    const password = body?.password ?? "";
    const name = (body?.name ?? "").trim();

    if (!email || !password || password.length < 8) {
      return NextResponse.json(
        { error: "Email required and password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || null },
      select: { id: true, email: true, name: true, role: true }
    });

    return NextResponse.json({ ok: true, user });
  } catch (err: any) {
    // This makes failures obvious in Vercel logs and in the UI.
    console.error("REGISTER_ERROR", err);

    return NextResponse.json(
      {
        ok: false,
        error: "Registration failed on server.",
        detail: err?.message ?? String(err)
      },
      { status: 500 }
    );
  }
}

