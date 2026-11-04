"use client";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageTitle } from "@/components/Shell";
import { Button, Empty, ErrorNote, Field, inputClass, Loading, Panel, Stat, Status } from "@/components/ui";
import { downloadCsv, formatDate, formatTime, percent, useApi } from "@/lib/api";

type Record = { id: number; topic: string; startedAt: string; classId: number; className: string; subject: string; present: boolean; markedAt: string | null; method: "face" | "manual" | null };

function History() {
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = new URLSearchParams(Object.entries({ classId, from, to }).filter(([, value]) => value)).toString();
  const { data, error } = useApi<{ records: Record[] }>(`/api/student/attendance?${query}`);
  const { data: classes } = useApi<{ classes: { id: number; name: string }[] }>("/api/student/classes");

  const records = data?.records;
  const present = useMemo(() => records?.filter((r) => r.present).length ?? 0, [records]);

  function exportCsv() {
    if (!records) return;
    downloadCsv("my-attendance.csv", [
      ["Date", "Time", "Class", "Subject", "Topic", "Status", "Marked by"],
      ...records.map((r) => [formatDate(r.startedAt), formatTime(r.startedAt), r.className, r.subject, r.topic, r.present ? "Present" : "Absent", r.method ?? ""]),
    ]);
  }

  return (
    <>
      <PageTitle
        title="My attendance"
        action={<Button variant="secondary" disabled={!records?.length} onClick={exportCsv}><Download size={16} aria-hidden="true" /> Export to Excel</Button>}
      />
      <Panel className="mb-4 grid gap-4 sm:grid-cols-3">
        <Field label="Class">
          <select className={inputClass} name="class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="From"><input className={inputClass} type="date" name="from" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className={inputClass} type="date" name="to" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Panel>
      <ErrorNote>{error}</ErrorNote>
      {!records && !error && <Loading />}
      {records && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Present" value={present} tone="good" />
            <Stat label="Absent" value={records.length - present} tone="stop" />
            <Stat label="Rate" value={records.length ? `${percent(present, records.length)}%` : "–"} />
          </div>
          {records.length === 0 ? (
            <Empty title="No sessions to show">Attendance appears here once your teacher finishes a session.</Empty>
          ) : (
            <Panel className="!p-2 sm:!p-3">
              <ul className="divide-y divide-line">
                {records.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="[overflow-wrap:anywhere]">{r.className}{r.topic && <span className="text-muted"> · {r.topic}</span>}</p>
                      <p className="text-sm text-muted">{formatDate(r.startedAt)}, {formatTime(r.startedAt)}{r.method === "manual" && " · marked by teacher"}</p>
                    </div>
                    <Status present={r.present} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </>
  );
}

export default function AttendancePage() {
  return (
    <AppShell role="student">
      <History />
    </AppShell>
  );
}
