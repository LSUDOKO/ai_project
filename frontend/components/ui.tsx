"use client";
import { Check, Copy, Loader2, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-medium transition-[background-color,transform,filter] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";
const variants = {
  primary: "bg-forest-deep text-white shadow-[var(--shadow-soft)] hover:brightness-110",
  secondary: "bg-raised text-ink shadow-[var(--shadow-soft)] hover:brightness-105",
  danger: "bg-danger text-white hover:brightness-110",
  ghost: "text-ink underline-offset-4 hover:underline",
};
type Variant = keyof typeof variants;

export function Button({ variant = "primary", busy = false, className = "", children, disabled, ...p }: ComponentProps<"button"> & { variant?: Variant; busy?: boolean }) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={disabled || busy} {...p}>
      {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", className = "", ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...p} />;
}

export function Panel({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "good" | "stop" | "wait" }) {
  const tones = { good: "bg-good-soft", stop: "bg-stop-soft", wait: "bg-wait-soft" };
  return <section className={`rounded-panel p-5 shadow-[var(--shadow-soft)] sm:p-6 ${tone ? tones[tone] : "bg-card"} ${className}`}>{children}</section>;
}

export function IconButton({ label, className = "", children, ...p }: ComponentProps<"button"> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised/90 text-ink shadow-[var(--shadow-soft)] hover:brightness-105 ${className}`} {...p}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

export const inputClass = "w-full rounded-2xl border border-line bg-raised px-4 py-3 text-base outline-none placeholder:text-muted/80 focus:border-forest";

const CHIP_TONES = {
  neutral: "bg-raised text-ink",
  good: "bg-good-soft text-good",
  stop: "bg-stop-soft text-stop",
  wait: "bg-wait-soft text-wait",
};

export function Chip({ tone = "neutral", className = "", children }: { tone?: keyof typeof CHIP_TONES; className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm ${CHIP_TONES[tone]} ${className}`}>{children}</span>;
}

export function Status({ present }: { present: boolean }) {
  return (
    <Chip tone={present ? "good" : "stop"}>
      {present ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      {present ? "Present" : "Absent"}
    </Chip>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-stop-soft px-4 py-3 text-sm text-stop">
      {children}
    </p>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted">
      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Percentage ring: the signature circular reading from SplitSide, used for attendance rates. */
export function Ring({ value, size = 64, label }: { value: number; size?: number; label: string }) {
  const stroke = 4;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="text-sm font-medium">{value}%</span>
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "stop" }) {
  return (
    <div className="rounded-3xl bg-raised px-4 py-3 shadow-[var(--shadow-soft)]">
      <p className={`text-3xl font-light ${tone === "good" ? "text-good" : tone === "stop" ? "text-stop" : ""}`}>{value}</p>
      <p className="mt-0.5 text-sm text-muted">{label}</p>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-panel bg-card p-6 text-ink shadow-[var(--shadow-float)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-normal">{title}</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>
      {open && children}
    </dialog>
  );
}

export function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

const THEME_KEY = "rollcall-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // The theme is set on <html> before hydration, so it can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  return (
    <IconButton
      label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {}
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </IconButton>
  );
}
