import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

CredentialsProvider({
  name: "Credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" }
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.password) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { email: credentials.email }
    });

    if (!user || !user.password) {
      return null;
    }

    const isValid = await bcrypt.compare(
      credentials.password,
      user.password
    );

    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
});
