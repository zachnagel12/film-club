"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function register() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error ?? "Registration failed.");
        return;
      }

      const r = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (r?.error) {
        setMsg("Created account, but login failed.");
        return;
      }

      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);
    setMsg(null);
    try {
      const r = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (r?.error) {
        setMsg("Invalid email or password.");
        return;
      }

      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Film Club</h1>
        <p className="text-sm text-white/70">
          {mode === "login" ? "Log in" : "Create an account"}
        </p>
      </div>

      {mode === "register" && (
        <div className="mb-3">
          <label className="mb-1 block text-sm text-white/80">Name</label>
          <input
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>
      )}

      <div className="mb-3">
        <label className="mb-1 block text-sm text-white/80">Email</label>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm text-white/80">Password</label>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Min 8 characters"
        />
      </div>

      {msg && <div className="mb-3 text-sm text-red-300">{msg}</div>}

      <button
        onClick={mode === "login" ? login : register}
        disabled={loading}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "Working..." : mode === "login" ? "Log in" : "Create account"}
      </button>

      <button
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="mt-3 w-full text-sm text-white/70 underline"
      >
        {mode === "login" ? "Need an account?" : "Already have an account?"}
      </button>
    </div>
  );
}
