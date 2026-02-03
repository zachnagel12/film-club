import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    // 1) Validate
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 2) Normalize email
    const normalizedEmail = String(email).toLowerCase().trim();

    // 3) Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // 4) Hash password into passwordHash (matches your schema)
    const passwordHash = await bcrypt.hash(String(password), 10);

    // 5) Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name ? String(name).trim() : null,
        // role defaults to USER automatically in your schema
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    // 6) Return safe user data (no passwordHash)
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
