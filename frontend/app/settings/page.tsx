"use client";
import { Check } from "lucide-react";
import { useState } from "react";
import { AppShell, PageTitle, signOut, useUser } from "@/components/Shell";
import { Button, ErrorNote, Field, inputClass, Modal, Panel } from "@/components/ui";
import { api, setToken, type User } from "@/lib/api";

const DEPARTMENTS = ["Computer Science", "Information Technology", "Electronics", "Electrical", "Mechanical", "Civil", "Chemical", "Mathematics", "Physics", "Business", "Other"];
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

function Profile() {
  const { user, setUser } = useUser();
  const [form, setForm] = useState(user);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof User) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: event.target.value });
    setSaved(false);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/me", { method: "PATCH", body: form });
      setUser(result.user);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const student = user.role === "student";
  return (
    <Panel>
      <h2 className="mb-4 text-xl font-normal">Profile</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input className={inputClass} name="name" required value={form.name} onChange={set("name")} /></Field>
        <Field label="Email"><input className={`${inputClass} opacity-70`} value={user.email} disabled /></Field>
        <Field label="Department">
          <input className={inputClass} name="department" list="departments" value={form.department} onChange={set("department")} />
          <datalist id="departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="Phone"><input className={inputClass} type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={set("phone")} /></Field>
        {student ? (
          <>
            <Field label="Roll number"><input className={inputClass} name="rollNo" value={form.rollNo} onChange={set("rollNo")} /></Field>
            <Field label="Year">
              <input className={inputClass} name="year" list="years" value={form.year} onChange={set("year")} />
              <datalist id="years">{YEARS.map((y) => <option key={y} value={y} />)}</datalist>
            </Field>
            <Field label="Division"><input className={inputClass} name="division" value={form.division} onChange={set("division")} /></Field>
            <Field label="Semester"><input className={inputClass} name="semester" value={form.semester} onChange={set("semester")} /></Field>
          </>
        ) : (
          <Field label="Employee ID"><input className={inputClass} name="employeeId" value={form.employeeId} onChange={set("employeeId")} /></Field>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" busy={busy}>Save profile</Button>
          {saved && <span role="status" className="inline-flex items-center gap-1 text-sm text-good"><Check size={16} aria-hidden="true" /> Saved</span>}
        </div>
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
      </form>
    </Panel>
  );
}

function Password() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const { token } = await api<{ token: string }>("/api/me/password", { body: form });
      setToken(token);
      setForm({ currentPassword: "", newPassword: "" });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <Panel>
      <h2 className="mb-4 text-xl font-normal">Password</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Current password"><input className={inputClass} type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 8 characters"><input className={inputClass} type="password" autoComplete="new-password" minLength={8} required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="secondary" busy={busy}>Change password</Button>
          {saved && <span role="status" className="inline-flex items-center gap-1 text-sm text-good"><Check size={16} aria-hidden="true" /> Changed. Other devices have been signed out.</span>}
        </div>
        <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>
      </form>
    </Panel>
  );
}

function DeleteAccount() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/me", { method: "DELETE", body: { password } });
      signOut();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Panel tone="stop">
      <h2 className="text-xl font-normal">Delete account</h2>
      <p className="mb-4 mt-1 text-sm">
        {user.role === "teacher" ? "Permanently removes your account, your classes and all their attendance records." : "Permanently removes your account, your face template and your attendance records."}
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete my account</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-muted">This can&apos;t be undone. Enter your password to confirm.</p>
          <Field label="Password"><input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="danger" busy={busy} className="w-full">Delete permanently</Button>
        </form>
      </Modal>
    </Panel>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <PageTitle title="Settings" />
        <Profile />
        <Password />
        <DeleteAccount />
      </div>
    </AppShell>
  );
}
