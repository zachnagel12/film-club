"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// ✅ This forces Next to treat the page as dynamic (no prerender crash)
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();

  // ✅ Hardcode where to go after login
  // Change "/" to "/movies" later if your generator lives there.
  const callbackUrl = "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false, // we manually redirect below
      callbackUrl,
    });

    setLoading(false);

    if (!res) {
      setErrorMsg("Login failed. Please try again.");
      return;
    }

    if (res.error) {
      setErrorMsg("Invalid email or password.");
      return;
    }

    // ✅ Success -> go to your movie rec page
    router.push(res.url || callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-white/10 rounded-2xl p-6 bg-white/5">
        <h1 className="text-2xl font-semibold mb-2">Login
