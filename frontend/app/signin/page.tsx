"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { homeFor } from "@/components/Shell";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { api, getToken, setToken, wakeServer, type User } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    wakeServer();
    if (getToken()) router.replace("/settings");
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, user } = await api<{ token: string; user: User }>("/api/signin", { body: { email, password } });
      setToken(token);
      router.replace(homeFor(user));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Welcome back" subtitle={<>New here? <Link href="/signup" className="font-medium text-ink underline underline-offset-4">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className={inputClass} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" busy={busy} className="w-full">Sign in</Button>
      </form>
    </AuthFrame>
  );
}
