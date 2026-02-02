import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

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

      const r = await signIn("credentials", { redirect: false, email, password });
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
      const r = await signIn("credentials", { redirect: false, email, password });
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
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1>Film Club</h1>
      <p>{mode === "login" ? "Log in" : "Create an account"}</p>

      {mode === "register" && (
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 10 }}
        />
      )}

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 10, padding: 10 }}
      />

      <input
        type="password"
        placeholder="Password (8+ chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 10, padding: 10 }}
      />

      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      <button onClick={mode === "login" ? login : register} disabled={loading}>
        {loading ? "Working..." : mode === "login" ? "Log in" : "Create account"}
      </button>

      <div style={{ marginTop: 12 }}>
        <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </div>
    </div>
  );
}
