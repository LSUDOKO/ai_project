"use client";
import { GraduationCap, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { homeFor } from "@/components/Shell";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { api, getToken, savePendingCode, setToken, wakeServer, type User } from "@/lib/api";

type Role = "student" | "teacher";

export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [invited, setInvited] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", department: "", employeeId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    wakeServer();
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) savePendingCode(code);
    if (getToken()) {
      router.replace(code ? "/student" : "/settings");
      return;
    }
    // Query strings only exist in the browser, so these can't be initial state on a static page.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (code) setInvited(true);
    if (params.get("role") === "teacher") setRole("teacher");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router]);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, user } = await api<{ token: string; user: User }>("/api/signup", { body: { ...form, role } });
      setToken(token);
      router.replace(homeFor(user));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={invited ? "Join your class" : "Create your account"}
      subtitle={invited ? "Your class code is saved. Sign up and you'll be added automatically." : <>Already have one? <Link href="/signin" className="font-medium text-ink underline underline-offset-4">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        {!invited && (
          <div role="radiogroup" aria-label="I am a" className="grid grid-cols-2 gap-1 rounded-full bg-raised p-1">
            {([["student", "Student", UserRound], ["teacher", "Teacher", GraduationCap]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" role="radio" aria-checked={role === value} onClick={() => setRole(value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-full text-sm transition-colors ${role === value ? "bg-night text-white" : "text-ink"}`}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}
        <Field label="Full name">
          <input className={inputClass} name="name" autoComplete="name" required value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" name="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <input className={inputClass} type="password" name="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={set("password")} />
        </Field>
        {role === "teacher" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department (optional)">
              <input className={inputClass} name="department" value={form.department} onChange={set("department")} />
            </Field>
            <Field label="Employee ID (optional)">
              <input className={inputClass} name="employeeId" value={form.employeeId} onChange={set("employeeId")} />
            </Field>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" busy={busy} className="w-full">Create account</Button>
        <p className="text-center text-sm text-muted">
          See how we handle your data in the <Link href="/privacy" className="underline underline-offset-4">privacy notice</Link>.
        </p>
      </form>
    </AuthFrame>
  );
}
