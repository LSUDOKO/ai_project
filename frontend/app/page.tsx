"use client";
import { ArrowRight, Check, CircleUserRound, Hand, KeyRound, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ScannerFrame } from "@/components/Camera";
import { Logo } from "@/components/Shell";
import { ButtonLink, Panel, ThemeToggle } from "@/components/ui";
import { getToken, wakeServer } from "@/lib/api";

function FaceMesh() {
  return (
    <svg viewBox="0 0 200 270" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="270" fill="#6f8b6d" />
      <rect x="100" width="100" height="270" fill="#55705a" />
      <g fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round">
        <path d="M100 40c-38 0-58 30-58 72 0 50 28 98 58 98s58-48 58-98c0-42-20-72-58-72z" strokeOpacity="0.7" />
        <path d="M68 104c8-6 18-6 24 0M108 104c6-6 16-6 24 0" strokeOpacity="0.95" />
        <path d="M100 118v26c0 5-4 8-10 8" strokeOpacity="0.8" />
        <path d="M84 176c10 6 22 6 32 0" strokeOpacity="0.95" />
        <path d="M100 18v232" strokeDasharray="4 5" strokeOpacity="0.5" />
      </g>
      <g fill="white">
        {[[58, 92], [80, 86], [120, 86], [142, 92], [52, 130], [148, 130], [72, 124], [128, 124], [100, 146], [66, 164], [134, 164], [84, 176], [116, 176], [100, 196], [100, 60], [70, 66], [130, 66]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" />
        ))}
      </g>
      <g stroke="white" strokeOpacity="0.35" strokeWidth="0.8">
        <path d="M58 92L80 86L72 124L52 130zM142 92L120 86L128 124L148 130zM72 124L100 146L66 164zM128 124L100 146L134 164zM66 164L84 176L100 146L116 176L134 164M84 176L100 196L116 176M70 66L100 60L130 66L120 86L80 86z" fill="none" />
      </g>
    </svg>
  );
}

const SAMPLE_ROSTER = ["Asha Verma", "Daniel Mensah", "Mei Tan"];

function HeroArt() {
  return (
    <div className="relative mx-auto w-full max-w-md py-2">
      <ScannerFrame active>
        <FaceMesh />
        <div className="scanline absolute inset-x-0 h-0.5 bg-white/80 shadow-[0_0_14px_3px_rgb(255_255_255/0.45)]" />
      </ScannerFrame>
      <ul className="absolute -right-1 bottom-6 space-y-2 sm:-right-4" aria-hidden="true">
        {SAMPLE_ROSTER.map((name, index) => (
          <li key={name} className="flex items-center gap-2 rounded-full bg-raised py-1.5 pl-2 pr-4 text-sm shadow-[var(--shadow-float)]" style={{ animation: `tick-in 6s ${index * 0.7}s ease-out infinite alternate both` }}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-good-soft text-good"><Check size={14} /></span>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STEPS = [
  {
    title: "Teacher makes a class",
    body: "Name it, and you get a six-letter code. Share it in the group chat, or read it out on day one.",
    art: (
      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {"K7MQ2X".split("").map((letter) => (
          <span key={letter} className="flex h-12 w-9 items-center justify-center rounded-xl bg-raised text-xl shadow-[var(--shadow-soft)]">{letter}</span>
        ))}
      </div>
    ),
  },
  {
    title: "Students enrol once",
    body: "Each student joins with the code and takes five quick photos on their own phone. It takes about a minute.",
    art: (
      <div className="flex justify-center gap-2" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((shot) => (
          <span key={shot} className="flex h-14 w-10 items-center justify-center rounded-full bg-forest/25 text-forest-deep dark:text-ink">
            <CircleUserRound size={22} strokeWidth={1.4} style={{ transform: `rotate(${(shot - 2) * 9}deg)` }} />
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "Point the camera, teach",
    body: "Open a session on a laptop or phone at the door. Faces are matched as people walk in, and the register fills itself.",
    art: (
      <div className="mx-auto w-44 space-y-1.5" aria-hidden="true">
        {[true, true, false].map((present, index) => (
          <div key={index} className="flex items-center gap-2 rounded-full bg-raised px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${present ? "bg-good" : "bg-stop"}`} />
            <span className="h-1.5 flex-1 rounded-full bg-line" />
            {present ? "Present" : "Absent"}
          </div>
        ))}
      </div>
    ),
  },
];

const SAFEGUARDS = [
  { icon: UsersRound, title: "Only your class can match", body: "A session compares faces with that class's students and nobody else. A visitor in the room stays unknown." },
  { icon: CircleUserRound, title: "One face, one account", body: "A face that's already enrolled on another account is refused, so nobody can set up a friend's face to sign in for them." },
  { icon: Hand, title: "Teachers have the last word", body: "Every entry can be corrected by hand, even after the session ends, and the register shows which ones were manual." },
  { icon: KeyRound, title: "Private by default", body: "Teachers see only their own classes. Students see only their own record." },
];

export default function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    wakeServer();
    // Reading the saved session is only possible after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSignedIn(Boolean(getToken()));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <header className="sticky top-3 z-20 mt-3 flex items-center justify-between gap-2 rounded-full bg-card/85 py-2 pl-5 pr-2 shadow-[var(--shadow-soft)] backdrop-blur">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href={signedIn ? "/settings" : "/signin"} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">{signedIn ? "My account" : "Sign in"}</Link>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <section className="grid items-center gap-8 pb-16 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div className="rise">
            <h1 className="text-5xl font-light leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
              Stop calling names.
              <span className="block text-muted">Start the class.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Rollcall takes attendance by face. Students enrol once on their own phone, you point a camera at the door, and the register fills itself. Free to use, and no photos are kept.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup?role=teacher" className="pr-2">
                I teach a class
                <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-night"><ArrowRight size={16} aria-hidden="true" /></span>
              </ButtonLink>
              <ButtonLink href="/signup?role=student" variant="secondary">I&apos;m a student</ButtonLink>
            </div>
          </div>
          <HeroArt />
        </section>

        <section id="how-it-works" className="py-12">
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl">Three steps, and the first two only happen once.</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Panel className="flex h-full flex-col">
                  <div className="flex h-24 items-center justify-center">{step.art}</div>
                  <p className="mt-5 text-sm text-muted">Step {index + 1}</p>
                  <h3 className="mt-1 text-xl font-normal">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{step.body}</p>
                </Panel>
              </li>
            ))}
          </ol>
        </section>

        <section className="py-12">
          <h2 className="max-w-2xl text-3xl font-light tracking-tight sm:text-4xl">A register people can trust.</h2>
          <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {SAFEGUARDS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised shadow-[var(--shadow-soft)]"><Icon size={20} aria-hidden="true" /></span>
                <div>
                  <h3 className="text-lg font-normal">{title}</h3>
                  <p className="mt-1 leading-relaxed text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12">
          <div className="grid gap-8 rounded-[2.25rem] bg-night p-7 text-white shadow-[var(--shadow-float)] sm:p-10 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div>
              <ShieldCheck size={28} aria-hidden="true" />
              <h2 className="mt-4 text-3xl font-light tracking-tight sm:text-4xl">We keep a list of numbers, not your photo.</h2>
              <p className="mt-4 leading-relaxed text-white/75">
                Camera frames are read once and thrown away. All that&apos;s stored is a face template: 128 numbers that can&apos;t be turned back into a picture of you. It only exists if you agree to it, and it never leaves the server.
              </p>
              <Link href="/privacy" className="mt-5 inline-flex items-center gap-2 underline underline-offset-4">Read the privacy notice <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="flex items-start gap-3 rounded-3xl bg-white/8 p-5">
              <Trash2 size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="leading-relaxed text-white/85">Change your mind? Delete your face template, or your whole account, from settings in one step. It&apos;s gone straight away.</p>
            </div>
          </div>
        </section>

        <section className="py-16 text-center">
          <h2 className="text-4xl font-light tracking-tight sm:text-5xl">Take tomorrow&apos;s register in seconds.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/signup?role=teacher">Create a class</ButtonLink>
            <ButtonLink href="/signin" variant="secondary">Sign in</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-sm text-muted">
        <span>Rollcall</span>
        <span className="flex gap-5">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <a href="https://github.com/LSUDOKO/ai_project" className="hover:text-ink">Source code</a>
        </span>
      </footer>
    </div>
  );
}
