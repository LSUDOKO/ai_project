"use client";
import { ArrowRight, Check, LogOut } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell, PageTitle, useUser } from "@/components/Shell";
import { Button, Chip, Empty, ErrorNote, Field, IconButton, inputClass, Loading, Modal, Panel, Ring } from "@/components/ui";
import { api, percent, takePendingCode, useApi } from "@/lib/api";

type StudentClass = { id: number; name: string; subject: string; teacher: string; total: number; present: number };

function Checklist({ joined }: { joined: boolean }) {
  const { user } = useUser();
  const steps = [
    { done: Boolean(user.rollNo), label: "Add your roll number", hint: "So your teacher can find you on the register.", href: "/settings" },
    { done: Boolean(user.faceEnrolledAt), label: "Enrol your face", hint: "Five quick photos. About a minute.", href: "/student/face" },
    { done: joined, label: "Join a class", hint: "Use the code from your teacher, just below.", href: "#join" },
  ];
  if (steps.every((step) => step.done)) return null;
  return (
    <Panel className="mb-4">
      <h2 className="text-xl font-normal">Get set up</h2>
      <ol className="mt-3 divide-y divide-line">
        {steps.map((step) => (
          <li key={step.label}>
            <Link href={step.href} className="flex items-center gap-3 py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-good-soft text-good" : "bg-raised text-muted"}`}>
                {step.done ? <Check size={16} aria-label="Done" /> : <span className="h-2 w-2 rounded-full bg-current" aria-label="To do" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block ${step.done ? "text-muted line-through" : ""}`}>{step.label}</span>
                {!step.done && <span className="block text-sm text-muted">{step.hint}</span>}
              </span>
              {!step.done && <ArrowRight size={18} className="shrink-0 text-muted" aria-hidden="true" />}
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function StudentHome() {
  const { user } = useUser();
  const { data, error, reload } = useApi<{ classes: StudentClass[] }>("/api/student/classes");
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState<StudentClass | null>(null);

  const join = useCallback(
    async (value: string) => {
      setJoining(true);
      setJoinError("");
      try {
        await api("/api/student/classes/join", { body: { code: value } });
        setCode("");
        await reload();
      } catch (err) {
        setJoinError((err as Error).message);
        setCode(value);
      }
      setJoining(false);
    },
    [reload],
  );

  useEffect(() => {
    // Arrived through a teacher's invite link: join without asking them to retype the code.
    const pending = takePendingCode();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pending) join(pending);
  }, [join]);

  async function leave() {
    if (!leaving) return;
    await api(`/api/student/classes/${leaving.id}`, { method: "DELETE" });
    setLeaving(null);
    await reload();
  }

  const classes = data?.classes;
  return (
    <>
      <PageTitle title={`Hi, ${user.name.split(" ")[0]}`} subtitle={user.faceEnrolledAt ? "Your face is enrolled. You're ready for class." : "A couple of things to do and you're ready for class."} />
      <ErrorNote>{error}</ErrorNote>
      {!classes && !error && <Loading />}
      {classes && (
        <>
          <Checklist joined={classes.length > 0} />
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-3">
              <h2 className="text-xl font-normal">My classes</h2>
              {classes.length === 0 && <Empty title="You haven't joined a class yet">Ask your teacher for the six-letter class code.</Empty>}
              {classes.map((klass) => (
                <Panel key={klass.id} className="flex items-center gap-4">
                  <span className={klass.total && percent(klass.present, klass.total) < 75 ? "text-stop" : "text-good"}>
                    <Ring value={percent(klass.present, klass.total)} label={`${percent(klass.present, klass.total)}% attendance`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-normal">{klass.name}</h3>
                    <p className="truncate text-sm text-muted">{[klass.subject, klass.teacher].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-sm text-muted">{klass.total ? `${klass.present} of ${klass.total} sessions attended` : "No sessions yet"}</p>
                  </div>
                  <IconButton label={`Leave ${klass.name}`} onClick={() => setLeaving(klass)}><LogOut size={16} aria-hidden="true" /></IconButton>
                </Panel>
              ))}
            </div>
            <div className="space-y-4">
              <Panel>
                <h2 id="join" className="scroll-mt-20 text-xl font-normal">Join a class</h2>
                <form
                  className="mt-3 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    join(code);
                  }}
                >
                  <Field label="Class code">
                    <input className={`${inputClass} text-center text-xl uppercase tracking-[0.3em]`} name="code" maxLength={6} autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                  </Field>
                  <ErrorNote>{joinError}</ErrorNote>
                  <Button type="submit" busy={joining} className="w-full">Join class</Button>
                </form>
              </Panel>
              <Panel className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">Face recognition</p>
                  {user.faceEnrolledAt ? <Chip tone="good"><Check size={14} aria-hidden="true" /> Enrolled</Chip> : <Chip tone="wait">Not enrolled</Chip>}
                </div>
                <Link href="/student/face" className="text-sm underline underline-offset-4">{user.faceEnrolledAt ? "Test or manage" : "Enrol now"}</Link>
              </Panel>
            </div>
          </div>
        </>
      )}
      <Modal open={Boolean(leaving)} onClose={() => setLeaving(null)} title={`Leave ${leaving?.name ?? "class"}?`}>
        <p className="mb-4 text-muted">You&apos;ll stop appearing on this class&apos;s register. You can rejoin with the code.</p>
        <Button variant="danger" className="w-full" onClick={leave}>Leave class</Button>
      </Modal>
    </>
  );
}

export default function StudentPage() {
  return (
    <AppShell role="student">
      <StudentHome />
    </AppShell>
  );
}
