"use client";
import { useEffect, useState } from "react";
import { SLOW_EVENT } from "@/lib/api";

/** The free backend sleeps when idle. This explains the wait instead of leaving a silent spinner. */
export function WakeBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const onSlow = (event: Event) => setSlow((event as CustomEvent<boolean>).detail);
    window.addEventListener(SLOW_EVENT, onSlow);
    return () => window.removeEventListener(SLOW_EVENT, onSlow);
  }, []);
  if (!slow) return null;
  return (
    <div role="status" className="rise fixed inset-x-4 top-4 z-50 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl bg-forest-deep px-5 py-3 text-sm text-white shadow-[var(--shadow-float)]">
      <span className="pulse-dot mr-2 inline-block h-2 w-2 rounded-full bg-white" aria-hidden="true" />
      Waking the server up. This can take up to a minute after it has been idle.
    </div>
  );
}
