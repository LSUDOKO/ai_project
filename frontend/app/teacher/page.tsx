"use client";
import { ArrowRight, Plus, Radio, ScanFace, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, PageTitle, useUser } from "@/components/Shell";
import { Button, Chip, Empty, ErrorNote, Field, inputClass, Loading, Modal, Panel, Stat } from "@/components/ui";
import { api, formatDate, formatTime, percent, useApi } from "@/lib/api";

type ClassSummary = { id: number; name: string; subject: string; joinCode: string; students: number; enrolled: number; sessions: number; openSessionId: number | null };
type RecentSession = { id: number; topic: string; startedAt: string; className: string; present: number; total: number };

function NewClass({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: number }>("/api/classes", { body: { name, subject } });
      router.push(`/teacher/class/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New class">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Class name" hint="For example: CSE 3rd year, Section B">
          <input className={inputClass} name="className" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Subject (optional)">
          <input className={inputClass} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" busy={busy} className="w-full">Create class</Button>
      </form>
    </Modal>
  );
}

function Classes() {
  const { user } = useUser();
  const { data, error } = useApi<{ classes: ClassSummary[]; recentSessions: RecentSession[] }>("/api/classes");
  const [creating, setCreating] = useState(false);

  const classes = data?.classes;
  const recent = data?.recentSessions ?? [];
  const totals = recent.reduce((sum, s) => ({ present: sum.present + s.present, total: sum.total + s.total }), { present: 0, total: 0 });

  return (
    <>
      <PageTitle
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle="Your classes and recent registers."
        action={<Button onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> New class</Button>}
      />
      <ErrorNote>{error}</ErrorNote>
      {!classes && !error && <Loading />}
      {classes?.length === 0 && (
        <Panel className="py-10 text-center">
          <ScanFace size={44} strokeWidth={1.2} className="mx-auto text-forest" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-light">Create your first class</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">You&apos;ll get a code to share with students. Once they&apos;ve joined and enrolled their faces, you can take attendance with a camera.</p>
          <Button className="mt-5" onClick={() => setCreating(true)}><Plus size={18} aria-hidden="true" /> New class</Button>
        </Panel>
      )}
      {classes && classes.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2">
            {classes.map((klass) => (
              <Link key={klass.id} href={`/teacher/class/${klass.id}`} className="block rounded-panel transition-transform hover:-translate-y-0.5">
                <Panel className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 text-xl font-normal [overflow-wrap:anywhere]">{klass.name}</h2>
                    <ArrowRight size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  </div>
                  {klass.subject && <p className="text-sm text-muted">{klass.subject}</p>}
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <Chip><UsersRound size={14} aria-hidden="true" /> {klass.students} student{klass.students === 1 ? "" : "s"}</Chip>
                    <Chip tone={klass.enrolled < klass.students ? "wait" : "good"}><ScanFace size={14} aria-hidden="true" /> {klass.enrolled} enrolled</Chip>
                    {klass.openSessionId && <Chip tone="stop"><Radio size={14} aria-hidden="true" /> Session open</Chip>}
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-normal">Recent sessions</h2>
            {recent.length === 0 ? (
              <Empty title="No sessions yet">Open a class and start your first session.</Empty>
            ) : (
              <>
                <Stat label={`Average over the last ${recent.length} session${recent.length === 1 ? "" : "s"}`} value={`${percent(totals.present, totals.total)}%`} />
                <Panel className="!p-2">
                  <ul className="divide-y divide-line">
                    {recent.map((s) => (
                      <li key={s.id}>
                        <Link href={`/teacher/session/${s.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-raised/60">
                          <span className="min-w-0">
                            <span className="block truncate">{s.className}</span>
                            <span className="block text-sm text-muted">{formatDate(s.startedAt)}, {formatTime(s.startedAt)}</span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">{s.present}/{s.total} present</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </>
            )}
          </div>
        </div>
      )}
      <NewClass open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export default function TeacherPage() {
  return (
    <AppShell role="teacher">
      <Classes />
    </AppShell>
  );
}
