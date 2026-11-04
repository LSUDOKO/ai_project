"use client";
import { ChevronLeft, Download, Pencil, Play, Radio, ScanFace, Search, Trash2, UserMinus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, PageTitle } from "@/components/Shell";
import { Button, Chip, CopyButton, Empty, ErrorNote, Field, IconButton, inputClass, Loading, Modal, Panel } from "@/components/ui";
import { api, downloadCsv, formatDate, formatTime, percent, useApi, type StudentRow } from "@/lib/api";

type Klass = { id: number; name: string; subject: string; joinCode: string; students: number; enrolled: number; sessions: number; openSessionId: number | null };
type Student = StudentRow & { total: number; present: number };
type Session = { id: number; topic: string; startedAt: string; endedAt: string | null; present: number; total: number };
type Detail = { klass: Klass; students: Student[]; sessions: Session[] };
type Report = { name: string; sessions: { id: number; topic: string; startedAt: string }[]; students: { id: number; name: string; rollNo: string; email: string; joinedAt: string }[]; marks: { sessionId: number; studentId: number }[] };

function StartSession({ classId, open, onClose }: { classId: number; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: number }>(`/api/classes/${classId}/sessions`, { body: { topic } });
      router.push(`/teacher/session/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a session">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Topic (optional)" hint="Shown to students in their attendance history.">
          <input className={inputClass} name="topic" autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" busy={busy} className="w-full"><Play size={16} aria-hidden="true" /> Start session</Button>
      </form>
    </Modal>
  );
}

function EditStudent({ classId, student, onClose, onSaved }: { classId: number; student: Student; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(student);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/classes/${classId}/students/${student.id}`, { method: "PATCH", body: form });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const input = (key: "name" | "rollNo" | "department" | "year" | "division" | "semester" | "phone") => (
    <input className={inputClass} name={key} required={key === "name"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name">{input("name")}</Field>
      <Field label="Roll number">{input("rollNo")}</Field>
      <Field label="Department">{input("department")}</Field>
      <Field label="Year">{input("year")}</Field>
      <Field label="Division">{input("division")}</Field>
      <Field label="Semester">{input("semester")}</Field>
      <div className="sm:col-span-2"><Field label="Phone">{input("phone")}</Field></div>
      <div className="space-y-3 sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-3">
          <Button type="submit" busy={busy} className="flex-1">Save</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}

function Roster({ data, reload }: { data: Detail; reload: () => void }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Student | null>(null);
  const [removing, setRemoving] = useState<Student | null>(null);
  const q = search.trim().toLowerCase();
  const students = data.students.filter((s) => [s.name, s.rollNo, s.email].some((value) => value.toLowerCase().includes(q)));

  async function remove() {
    if (!removing) return;
    await api(`/api/classes/${data.klass.id}/students/${removing.id}`, { method: "DELETE" });
    setRemoving(null);
    reload();
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-normal">Students</h2>
        {data.students.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input className={`${inputClass} !py-2.5 pl-10`} type="search" aria-label="Search students" placeholder="Name, roll number, email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>
      {data.students.length === 0 && <Empty title="Nobody has joined yet">Share the class code or invite link, and students will appear here as they join.</Empty>}
      {data.students.length > 0 && students.length === 0 && <Empty title="No students match that search" />}
      {students.length > 0 && (
        <Panel className="!p-2 sm:!p-3">
          <ul className="divide-y divide-line">
            {students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate">{s.name}</p>
                  <p className="truncate text-sm text-muted">{[s.rollNo, s.email].filter(Boolean).join(" · ")}</p>
                </div>
                {s.faceEnrolled ? <Chip tone="good"><ScanFace size={14} aria-hidden="true" /> Enrolled</Chip> : <Chip tone="wait">No face yet</Chip>}
                <span className="w-24 text-sm text-muted">{s.total ? `${percent(s.present, s.total)}% (${s.present}/${s.total})` : "No sessions"}</span>
                <span className="flex gap-2">
                  <IconButton label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil size={16} aria-hidden="true" /></IconButton>
                  <IconButton label={`Remove ${s.name}`} onClick={() => setRemoving(s)}><UserMinus size={16} aria-hidden="true" /></IconButton>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit student">
        {editing && (
          <EditStudent
            key={editing.id}
            classId={data.klass.id}
            student={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? "student"}?`}>
        <p className="mb-4 text-muted">They&apos;ll leave this class&apos;s register. Their account stays, and they can rejoin with the code.</p>
        <Button variant="danger" className="w-full" onClick={remove}>Remove from class</Button>
      </Modal>
    </section>
  );
}

function ClassDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useApi<Detail>(`/api/classes/${params.id}`);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "" });
  const [exportError, setExportError] = useState("");

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { klass, sessions } = data;
  const invite = typeof window === "undefined" ? "" : `${window.location.origin}/signup?role=student&code=${klass.joinCode}`;

  async function saveClass(event: React.FormEvent) {
    event.preventDefault();
    await api(`/api/classes/${klass.id}`, { method: "PATCH", body: form });
    setEditing(false);
    reload();
  }

  async function removeClass() {
    await api(`/api/classes/${klass.id}`, { method: "DELETE" });
    router.replace("/teacher");
  }

  async function exportReport() {
    setExportError("");
    try {
      const report = await api<Report>(`/api/classes/${klass.id}/report`);
      const present = new Set(report.marks.map((m) => `${m.sessionId}:${m.studentId}`));
      const sessionLabel = (s: Report["sessions"][number]) => `${formatDate(s.startedAt)} ${formatTime(s.startedAt)}${s.topic ? ` (${s.topic})` : ""}`;
      downloadCsv(`${report.name.replace(/[^\w-]+/g, "_")}-attendance.csv`, [
        ["Name", "Roll number", "Email", ...report.sessions.map(sessionLabel), "Present", "Sessions", "Rate"],
        ...report.students.map((student) => {
          const counted = report.sessions.filter((s) => s.startedAt >= student.joinedAt);
          const attended = report.sessions.filter((s) => present.has(`${s.id}:${student.id}`)).length;
          return [
            student.name,
            student.rollNo,
            student.email,
            ...report.sessions.map((s) => (present.has(`${s.id}:${student.id}`) ? "P" : s.startedAt >= student.joinedAt ? "A" : "")),
            attended,
            counted.length,
            `${percent(attended, counted.length)}%`,
          ];
        }),
      ]);
    } catch (err) {
      setExportError((err as Error).message);
    }
  }

  return (
    <>
      <Link href="/teacher" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} aria-hidden="true" /> All classes</Link>
      <PageTitle
        title={klass.name}
        subtitle={klass.subject}
        action={
          klass.openSessionId ? (
            <Link href={`/teacher/session/${klass.openSessionId}`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-stop-soft px-6 text-stop">
              <Radio size={18} aria-hidden="true" /> Return to open session
            </Link>
          ) : (
            <Button onClick={() => setStarting(true)}><Play size={16} aria-hidden="true" /> Start session</Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Roster data={data} reload={reload} />
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-normal">Sessions</h2>
              <Button variant="secondary" disabled={!sessions.some((s) => s.endedAt)} onClick={exportReport}><Download size={16} aria-hidden="true" /> Export to Excel</Button>
            </div>
            <ErrorNote>{exportError}</ErrorNote>
            {sessions.length === 0 ? (
              <Empty title="No sessions yet">Start one when you&apos;re ready to take attendance.</Empty>
            ) : (
              <Panel className="!p-2 sm:!p-3">
                <ul className="divide-y divide-line">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <Link href={`/teacher/session/${s.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-raised/60">
                        <span className="min-w-0">
                          <span className="block truncate">{formatDate(s.startedAt)}, {formatTime(s.startedAt)}{s.topic && <span className="text-muted"> · {s.topic}</span>}</span>
                        </span>
                        {s.endedAt ? <span className="shrink-0 text-sm">{s.present}/{s.total} present</span> : <Chip tone="stop">Open</Chip>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <Panel>
            <p className="text-sm text-muted">Class code</p>
            <p data-testid="join-code" className="mt-1 text-4xl font-light tracking-[0.2em]">{klass.joinCode}</p>
            <p className="mt-2 text-sm text-muted">Students enter this after signing up, or use the invite link.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton text={klass.joinCode} label="Copy code" />
              <CopyButton text={invite} label="Copy invite link" />
            </div>
          </Panel>
          <Panel>
            <p className="text-sm text-muted">Ready for the camera</p>
            <p className="mt-1 text-3xl font-light">{klass.enrolled} <span className="text-lg text-muted">of {klass.students}</span></p>
            <p className="mt-1 text-sm text-muted">Students without a face enrolled can still be marked by hand.</p>
          </Panel>
          <Panel className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setForm({ name: klass.name, subject: klass.subject });
                setEditing(true);
              }}
            >
              <Pencil size={16} aria-hidden="true" /> Edit class
            </Button>
            <Button variant="secondary" className="text-stop" onClick={() => setDeleting(true)}><Trash2 size={16} aria-hidden="true" /> Delete</Button>
          </Panel>
        </aside>
      </div>
      <StartSession classId={klass.id} open={starting} onClose={() => setStarting(false)} />
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit class">
        <form onSubmit={saveClass} className="space-y-4">
          <Field label="Class name"><input className={inputClass} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Subject"><input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Modal>
      <Modal open={deleting} onClose={() => setDeleting(false)} title={`Delete ${klass.name}?`}>
        <p className="mb-4 text-muted">This permanently deletes the class and every attendance record in it. Export first if you need them.</p>
        <Button variant="danger" className="w-full" onClick={removeClass}>Delete class</Button>
      </Modal>
    </>
  );
}

export default function ClassPage() {
  return (
    <AppShell role="teacher">
      <ClassDetail />
    </AppShell>
  );
}
