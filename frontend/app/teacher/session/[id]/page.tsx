"use client";
import { Camera as CameraIcon, ChevronLeft, CircleStop, Download, Pause, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/components/Camera";
import { AppShell, PageTitle } from "@/components/Shell";
import { Button, Chip, Empty, ErrorNote, inputClass, Loading, Modal, Panel, Ring, Stat } from "@/components/ui";
import { api, downloadCsv, formatDate, formatTime, percent, useApi, type StudentRow } from "@/lib/api";

type Student = StudentRow & { present: boolean; markedAt: string | null; method: "face" | "manual" | null; similarity: number | null };
type Session = { id: number; classId: number; className: string; subject: string; topic: string; startedAt: string; endedAt: string | null; students: Student[] };
type Face = { box: [number, number, number, number]; similarity: number; status: "marked" | "already" | "unknown"; studentId?: number; name?: string };
type Recognition = { faces: Face[]; frame: [number, number] };

const SCAN_GAP_MS = 700;

/** Boxes drawn over the mirrored video. "slice" matches the video's object-cover cropping. */
function FaceOverlay({ result }: { result: Recognition | null }) {
  if (!result) return null;
  const [width, height] = result.frame;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {result.faces.map((face, index) => {
        const [x, y, w, h] = face.box;
        const mirroredX = width - x - w;
        const known = face.status !== "unknown";
        const color = known ? "#7fd178" : "#f0c04f";
        const label = known ? face.name ?? "" : "Not recognised";
        // Sized against the frame width so it stays readable on a phone-width video.
        const fontSize = width * 0.036;
        const labelW = label.length * fontSize * 0.56 + fontSize;
        const labelH = fontSize * 1.5;
        // Keep the label inside what the cropped video shows (between 4:3 and 16:9, see the frame below).
        const edgeX = Math.max(0, (width - (height * 4) / 3) / 2);
        const edgeY = Math.max(0, (height - (width * 9) / 16) / 2);
        const labelX = Math.max(edgeX, Math.min(mirroredX, width - edgeX - labelW));
        const above = y - labelH - fontSize * 0.25;
        const labelY = above >= edgeY ? above : Math.max(edgeY, y) + fontSize * 0.25;
        return (
          <g key={index}>
            <rect x={mirroredX} y={y} width={w} height={h} rx={w * 0.16} fill="none" stroke={color} strokeWidth={Math.max(2.5, width / 240)} />
            <rect x={labelX} y={labelY} width={labelW} height={labelH} rx={labelH * 0.3} fill="rgb(16 22 18 / 0.88)" />
            <text x={labelX + fontSize * 0.5} y={labelY + labelH * 0.7} fill={color} fontSize={fontSize} fontFamily="inherit">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Scanner({ session, onMarked }: { session: Session; onMarked: () => void }) {
  const { videoRef, live, starting, error: cameraError, start: startCamera, stop: stopCamera, capture } = useCamera();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Recognition | null>(null);
  const [lastMarked, setLastMarked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const running = useRef(false);

  const loop = useCallback(async () => {
    while (running.current) {
      const image = capture();
      if (image) {
        try {
          const data = await api<Recognition>(`/api/sessions/${session.id}/recognize`, { body: { image }, quiet: true });
          if (!running.current) break;
          setResult(data);
          setError("");
          const marked = data.faces.filter((face) => face.status === "marked" && face.name).map((face) => face.name as string);
          if (marked.length) {
            setLastMarked((previous) => [...marked, ...previous].slice(0, 4));
            onMarked();
          }
        } catch (err) {
          if (!running.current) break;
          setError((err as Error).message);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, SCAN_GAP_MS));
    }
  }, [capture, onMarked, session.id]);

  useEffect(
    () => () => {
      running.current = false;
    },
    [],
  );

  async function start() {
    if (!live) await startCamera();
    running.current = true;
    setScanning(true);
    loop();
  }

  function pause() {
    running.current = false;
    setScanning(false);
    setResult(null);
  }

  return (
    <Panel className="!p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-night sm:aspect-video">
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        {scanning && <div className="scanline absolute inset-x-0 h-0.5 bg-white/60 shadow-[0_0_14px_3px_rgb(255_255_255/0.35)]" />}
        <FaceOverlay result={result} />
        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <p className="max-w-sm text-white/80">Point the camera at the door or the front of the room. Faces are matched against this class only.</p>
            <Button variant="secondary" busy={starting} onClick={start}><CameraIcon size={18} aria-hidden="true" /> Start scanning</Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 pt-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          {lastMarked.length > 0 ? <p className="truncate text-sm">Just marked: <span className="font-medium">{lastMarked.join(", ")}</span></p> : <p className="text-sm text-muted">{scanning ? "Scanning. Look at the camera, one or two people at a time works best." : "Camera is off."}</p>}
        </div>
        {live && (scanning ? <Button variant="secondary" onClick={pause}><Pause size={16} aria-hidden="true" /> Pause</Button> : <Button variant="secondary" onClick={start}><CameraIcon size={16} aria-hidden="true" /> Resume</Button>)}
      </div>
      <div className="px-2 empty:hidden"><ErrorNote>{cameraError || error}</ErrorNote></div>
    </Panel>
  );
}

function Register({ session, onToggle }: { session: Session; onToggle: (student: Student) => void }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const students = session.students.filter((s) => s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q));
  if (session.students.length === 0) {
    return <Empty title="No students in this class yet"><Link href={`/teacher/class/${session.classId}`} className="underline underline-offset-4">Share the class code</Link> so students can join.</Empty>;
  }
  return (
    <div>
      {session.students.length > 6 && (
        <div className="relative mb-3">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className={`${inputClass} !py-2.5 pl-10`} type="search" aria-label="Search the register" placeholder="Find a student" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      <Panel className="!p-2 sm:!p-3">
        <ul className="divide-y divide-line">
          {students.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="[overflow-wrap:anywhere]">{s.name}</p>
                <p className="truncate text-sm text-muted">
                  {s.present && s.markedAt ? `${formatTime(s.markedAt)} · ${s.method === "face" ? "by face" : "by hand"}` : s.faceEnrolled ? s.rollNo || "Not marked" : "No face enrolled"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={s.present}
                aria-label={`${s.name}: ${s.present ? "present" : "absent"}`}
                onClick={() => onToggle(s)}
                className={`min-h-11 w-24 shrink-0 rounded-full text-sm font-medium transition-colors ${s.present ? "bg-good-soft text-good" : "bg-stop-soft text-stop"}`}
              >
                {s.present ? "Present" : "Absent"}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function SessionView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, error, reload, setData } = useApi<Session>(`/api/sessions/${params.id}`);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ending, setEnding] = useState(false);
  const [actionError, setActionError] = useState("");

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!session) return <Loading />;

  const presentCount = session.students.filter((s) => s.present).length;
  const open = !session.endedAt;

  async function toggle(student: Student) {
    if (!session) return;
    const present = !student.present;
    setActionError("");
    // Update straight away so the button responds, then roll back if the save fails.
    setData({ ...session, students: session.students.map((s) => (s.id === student.id ? { ...s, present, method: present ? "manual" : null, markedAt: present ? new Date().toISOString() : null } : s)) });
    try {
      await api(`/api/sessions/${session.id}/students/${student.id}`, { method: "PUT", body: { present } });
    } catch (err) {
      setActionError((err as Error).message);
      reload();
    }
  }

  async function end() {
    setEnding(true);
    try {
      setData(await api<Session>(`/api/sessions/${params.id}/end`, { body: {} }));
      setConfirmEnd(false);
    } catch (err) {
      setActionError((err as Error).message);
    }
    setEnding(false);
  }

  async function remove() {
    if (!session) return;
    await api(`/api/sessions/${session.id}`, { method: "DELETE" });
    router.replace(`/teacher/class/${session.classId}`);
  }

  function exportCsv() {
    if (!session) return;
    downloadCsv(`attendance-${session.startedAt.slice(0, 10)}.csv`, [
      ["Name", "Roll number", "Email", "Status", "Marked at", "Marked by"],
      ...session.students.map((s) => [s.name, s.rollNo, s.email, s.present ? "Present" : "Absent", s.markedAt ? formatTime(s.markedAt) : "", s.method ?? ""]),
    ]);
  }

  return (
    <>
      <Link href={`/teacher/class/${session.classId}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} aria-hidden="true" /> {session.className}</Link>
      <PageTitle
        title={session.topic || session.className}
        subtitle={<>{formatDate(session.startedAt)}, {formatTime(session.startedAt)} {open ? <Chip tone="stop" className="ml-1"><span className="pulse-dot h-2 w-2 rounded-full bg-current" aria-hidden="true" /> Live</Chip> : <Chip className="ml-1">Finished</Chip>}</>}
        action={
          open ? (
            <Button onClick={() => setConfirmEnd(true)}><CircleStop size={18} aria-hidden="true" /> End session</Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportCsv}><Download size={16} aria-hidden="true" /> Export to Excel</Button>
              <Button variant="secondary" className="text-stop" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" /> Delete</Button>
            </div>
          )
        }
      />
      <ErrorNote>{actionError}</ErrorNote>
      <div className={`mt-3 grid grid-cols-1 items-start gap-5 ${open ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"}`}>
        {open ? (
          <Scanner session={session} onMarked={reload} />
        ) : (
          <Panel className="flex flex-col items-center gap-4 text-center">
            <span className="text-good"><Ring value={percent(presentCount, session.students.length)} size={120} label={`${percent(presentCount, session.students.length)}% present`} /></span>
            <div className="grid w-full grid-cols-2 gap-3">
              <Stat label="Present" value={presentCount} tone="good" />
              <Stat label="Absent" value={session.students.length - presentCount} tone="stop" />
            </div>
            <p className="text-sm text-muted">You can still correct this register by hand.</p>
          </Panel>
        )}
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-normal">Register</h2>
            <p data-testid="present-count" className="text-muted"><span className="text-2xl font-light tabular-nums text-ink">{presentCount}</span> of {session.students.length} present</p>
          </div>
          <Register session={session} onToggle={toggle} />
        </div>
      </div>
      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End this session?">
        <p className="mb-4 text-muted">{session.students.length - presentCount} student{session.students.length - presentCount === 1 ? "" : "s"} will be recorded as absent. You can still correct the register afterwards.</p>
        <Button className="w-full" busy={ending} onClick={end}>End session</Button>
      </Modal>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this session?">
        <p className="mb-4 text-muted">This removes the session and its attendance records for everyone in the class.</p>
        <Button variant="danger" className="w-full" onClick={remove}>Delete session</Button>
      </Modal>
    </>
  );
}

export default function SessionPage() {
  return (
    <AppShell role="teacher">
      <SessionView />
    </AppShell>
  );
}
