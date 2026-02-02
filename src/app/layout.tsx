import "./globals.css";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Film Club
            </Link>

            <nav className="flex items-center gap-4 text-sm text-white/80">
              <Link href="/login" className="hover:text-white">
                Login
              </Link>
              <Link href="/dashboard" className="hover:text-white">
                Dashboard
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
