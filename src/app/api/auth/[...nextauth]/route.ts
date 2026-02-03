import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const handler = NextAuth({
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        // 1) Validate input
        if (!credentials?.email || !credentials?.password) return null;

        // 2) Normalize email
        const email = credentials.email.toLowerCase().trim();

        // 3) Find user
        const user = await prisma.user.findUnique({
          where: { email },
        });

        // 4) If no user OR no passwordHash -> fail
        if (!user || !user.passwordHash) return null;

        // 5) Compare plaintext password to stored hash
        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) return null;

        // 6) Return user object that NextAuth stores in the token
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  pages: {
    signIn: "/login",
  },

  // 7) Put id + role into JWT and session so you can do manager access later
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // token is what persists
        token.id = user.id;
        // @ts-expect-error
        token.role = user.role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // @ts-expect-error
        session.user.id = token.id;
        // @ts-expect-error
        session.user.role = token.role;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
