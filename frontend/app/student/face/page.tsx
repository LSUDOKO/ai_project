"use client";
import { Camera as CameraIcon, Check, RefreshCw, ScanFace, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ScannerFrame, useCamera } from "@/components/Camera";
import { AppShell, PageTitle, useUser } from "@/components/Shell";
import { Button, Chip, ErrorNote, Modal, Panel } from "@/components/ui";
import { api, ApiError, formatDate, type User } from "@/lib/api";

const PROMPTS = ["Look straight at the camera", "Turn your head slightly left", "Turn your head slightly right", "Tilt your chin up a little", "Tilt your chin down a little"];

function Enroll({ onDone }: { onDone: () => void }) {
  const { setUser } = useUser();
  const { videoRef, live, starting, error: cameraError, start: startCamera, stop: stopCamera, capture } = useCamera();
  const [consent, setConsent] = useState(false);
  const [shots, setShots] = useState<(string | null)[]>(Array(PROMPTS.length).fill(null));
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const nextSlot = shots.findIndex((shot) => !shot);
  const complete = nextSlot === -1;

  async function takePhoto() {
    const image = capture();
    if (!image) return;
    setChecking(true);
    setError("");
    try {
      const { faces } = await api<{ faces: number[][] }>("/api/me/face/check", { body: { image } });
      if (faces.length === 1) setShots(shots.map((shot, index) => (index === nextSlot ? image : shot)));
      else setError(faces.length ? "More than one face is in the frame. Make sure you're alone in the shot." : "We couldn't see your face clearly. Move closer, face a light, and try again.");
    } catch (err) {
      setError((err as Error).message);
    }
    setChecking(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { user } = await api<{ user: User }>("/api/me/face", { body: { images: shots, consent } });
      setUser(user);
      stopCamera();
      onDone();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message);
      const bad = apiError.data?.shot;
      if (typeof bad === "number") setShots(shots.map((shot, index) => (index === bad ? null : shot)));
    }
    setSaving(false);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
      <div>
        <ScannerFrame active={live}>
          <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          {!live && (
            <div className="absolute inset-0 flex items-center justify-center text-white/90">
              <ScanFace size={56} strokeWidth={1.2} aria-hidden="true" />
            </div>
          )}
        </ScannerFrame>
        <ul className="mt-4 flex justify-center gap-2" aria-label="Photos taken">
          {shots.map((shot, index) => (
            <li key={index} className="relative h-16 w-12 overflow-hidden rounded-full bg-raised shadow-[var(--shadow-soft)]">
              {shot ? (
                <button type="button" aria-label={`Retake photo ${index + 1}`} title="Retake" className="group h-full w-full" onClick={() => setShots(shots.map((s, i) => (i === index ? null : s)))}>
                  <Image src={shot} alt="" fill unoptimized className="-scale-x-100 object-cover" />
                  <span className="absolute inset-0 hidden items-center justify-center bg-night/60 text-white group-hover:flex group-focus:flex"><X size={16} aria-hidden="true" /></span>
                </button>
              ) : (
                <span className={`flex h-full items-center justify-center text-sm ${index === nextSlot ? "font-medium text-ink" : "text-muted"}`}>{index + 1}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <Panel>
        {!live && !complete ? (
          <>
            <h2 className="text-xl font-normal">Before you start</h2>
            <p className="mt-2 leading-relaxed text-muted">We&apos;ll take five photos and turn them into a face template: 128 numbers used to recognise you in class. The photos are discarded straight away, and you can delete the template at any time.</p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-raised p-4">
              <input type="checkbox" name="consent" className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-forest)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-sm leading-relaxed">I agree to Rollcall creating and storing a face template of me to take attendance. <Link href="/privacy" className="underline underline-offset-4">Privacy notice</Link></span>
            </label>
            <ErrorNote>{cameraError}</ErrorNote>
            <Button className="mt-4 w-full" disabled={!consent} busy={starting} onClick={startCamera}>
              <CameraIcon size={18} aria-hidden="true" /> Start camera
            </Button>
          </>
        ) : complete ? (
          <>
            <h2 className="text-xl font-normal">All five taken</h2>
            <p className="mt-2 text-muted">Tap a photo to retake it, or save to finish. Saving can take a few seconds.</p>
            <div className="mt-4 space-y-3">
              <ErrorNote>{error}</ErrorNote>
              <Button className="w-full" busy={saving} onClick={save}><Check size={18} aria-hidden="true" /> Save my face</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Photo {nextSlot + 1} of {PROMPTS.length}</p>
            <h2 className="mt-1 text-2xl font-light" aria-live="polite">{PROMPTS[nextSlot]}</h2>
            <p className="mt-2 text-muted">Keep your face inside the oval, with good light in front of you.</p>
            <div className="mt-4 space-y-3">
              <ErrorNote>{error}</ErrorNote>
              <Button className="w-full" busy={checking} onClick={takePhoto}><CameraIcon size={18} aria-hidden="true" /> Take photo</Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function Manage({ onReenroll }: { onReenroll: () => void }) {
  const { user, setUser } = useUser();
  const { videoRef, live, starting, error: cameraError, start: startCamera, stop: stopCamera, capture } = useCamera();
  const [result, setResult] = useState<{ recognized: boolean; similarity: number } | "noface" | "many" | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function test() {
    const image = capture();
    if (!image) return;
    setTesting(true);
    setError("");
    try {
      const data = await api<{ faces: number[][]; match?: { recognized: boolean; similarity: number } }>("/api/me/face/check", { body: { image } });
      setResult(data.match ?? (data.faces.length ? "many" : "noface"));
    } catch (err) {
      setError((err as Error).message);
    }
    setTesting(false);
  }

  async function remove() {
    const { user: updated } = await api<{ user: User }>("/api/me/face", { method: "DELETE" });
    setUser(updated);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
      <ScannerFrame active={live}>
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        {!live && <div className="absolute inset-0 flex items-center justify-center text-white/90"><ScanFace size={56} strokeWidth={1.2} aria-hidden="true" /></div>}
      </ScannerFrame>
      <div className="space-y-4">
        <Panel>
          <Chip tone="good"><Check size={14} aria-hidden="true" /> Enrolled {user.faceEnrolledAt && formatDate(user.faceEnrolledAt)}</Chip>
          <h2 className="mt-3 text-xl font-normal">Test recognition</h2>
          <p className="mt-1 text-muted">Check that the camera knows you before class. Nothing is recorded on your attendance.</p>
          <div className="mt-4 space-y-3">
            <ErrorNote>{cameraError || error}</ErrorNote>
            {result && (
              <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${result === "noface" || result === "many" || !result.recognized ? "bg-stop-soft text-stop" : "bg-good-soft text-good"}`}>
                {result === "noface" && "No face found. Move closer and face a light."}
                {result === "many" && "More than one face is in the frame. Try again on your own."}
                {typeof result === "object" && (result.recognized ? `That's you. Match strength ${Math.round(result.similarity * 100)}%.` : `That doesn't look like your enrolled face (match strength ${Math.round(result.similarity * 100)}%). Better light may help, or you can re-enrol.`)}
              </p>
            )}
            {live ? (
              <Button className="w-full" busy={testing} onClick={test}><ScanFace size={18} aria-hidden="true" /> Test now</Button>
            ) : (
              <Button className="w-full" busy={starting} onClick={startCamera}><CameraIcon size={18} aria-hidden="true" /> Start camera</Button>
            )}
          </div>
        </Panel>
        <Panel className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onReenroll}><RefreshCw size={16} aria-hidden="true" /> Enrol again</Button>
          <Button variant="secondary" className="text-stop" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" /> Delete face data</Button>
        </Panel>
      </div>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your face data?">
        <p className="mb-4 text-muted">Your face template is removed straight away. The camera won&apos;t recognise you until you enrol again, but your teacher can still mark you by hand.</p>
        <Button variant="danger" className="w-full" onClick={remove}>Delete face data</Button>
      </Modal>
    </div>
  );
}

function FaceContent() {
  const { user } = useUser();
  const [reenrolling, setReenrolling] = useState(false);
  const enrolled = Boolean(user.faceEnrolledAt);
  const showManage = enrolled && !reenrolling;
  return (
    <>
      <PageTitle title="My face" subtitle={showManage ? "Test it, enrol again, or delete it." : "Five photos, once. You're done for every class."} />
      {showManage ? <Manage key="manage" onReenroll={() => setReenrolling(true)} /> : <Enroll key="enroll" onDone={() => setReenrolling(false)} />}
    </>
  );
}

export default function FacePage() {
  return (
    <AppShell role="student">
      <FaceContent />
    </AppShell>
  );
}
