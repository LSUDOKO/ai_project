"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_WIDTH = 640;

const FRIENDLY_ERRORS: Record<string, string> = {
  NotAllowedError: "Camera access was blocked. Allow the camera in your browser's site settings, then try again.",
  NotFoundError: "No camera was found on this device.",
  NotReadableError: "Your camera is being used by another app. Close it and try again.",
};

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't use the camera here. Open the site over HTTPS in a current browser.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
    } catch (err) {
      setError(FRIENDLY_ERRORS[(err as Error).name] ?? "The camera couldn't start. Please try again.");
    } finally {
      setStarting(false);
    }
  }, []);

  /** A JPEG of the current frame, small enough to upload quickly. Never saved anywhere by this app. */
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, live, starting, error, start, stop, capture };
}

/** Face-scanner capsule with a ring of fine ticks, as in SplitSide's guided scanner. */
export function ScannerFrame({ children, active = false, className = "" }: { children: React.ReactNode; active?: boolean; className?: string }) {
  const ticks = 120;
  return (
    <div className={`relative mx-auto w-full max-w-[19rem] ${className}`} style={{ aspectRatio: "3 / 4.1" }}>
      <svg viewBox="0 0 300 410" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => {
          const t = (i / ticks) * 2 * Math.PI;
          const nx = Math.sin(t);
          const ny = -Math.cos(t);
          const x = 150 + 146 * nx;
          const y = 205 + 200 * ny;
          return <line key={i} x1={x.toFixed(2)} y1={y.toFixed(2)} x2={(x - nx * 7).toFixed(2)} y2={(y - ny * 7).toFixed(2)} stroke="var(--color-forest)" strokeOpacity={active ? 1 : 0.7} strokeWidth="1.5" />;
        })}
      </svg>
      <div className="absolute inset-[14px] overflow-hidden rounded-[50%] bg-forest/80">{children}</div>
    </div>
  );
}
