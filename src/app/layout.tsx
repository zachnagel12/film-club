import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Movie Recommendation Generator",
  description: "TMDB-powered recommendations using Rec v2 scoring."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-50">{children}</body>
    </html>
  );
}
