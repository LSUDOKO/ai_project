"use client";
import { CalendarCheck, GraduationCap, Home, LogOut, ScanFace, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken, type User } from "@/lib/api";
import { ErrorNote, IconButton, Loading, ThemeToggle } from "./ui";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 text-lg font-medium tracking-tight ${className}`} aria-label="Rollcall home">
      <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M11 1a10 10 0 0 0 0 20z" fill="var(--color-forest)" />
        <path d="M11 1a10 10 0 0 1 0 20z" fill="var(--color-wait)" />
        <rect x="10.4" y="0" width="1.2" height="22" fill="var(--color-paper)" />
      </svg>
      Rollcall
    </Link>
  );
}

const NAV = {
  student: [
    { href: "/student", label: "Home", icon: Home, exact: true },
    { href: "/student/face", label: "My face", icon: ScanFace },
    { href: "/student/attendance", label: "Attendance", icon: CalendarCheck },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
  teacher: [
    { href: "/teacher", label: "Classes", icon: GraduationCap },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

export const homeFor = (user: Pick<User, "role">) => (user.role === "teacher" ? "/teacher" : "/student");

type UserContext = { user: User; setUser: (user: User) => void };
const Ctx = createContext<UserContext | null>(null);

export function useUser() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useUser needs AppShell");
  return value;
}

export function signOut() {
  setToken(null);
  window.location.assign("/");
}

/** Signed-in frame: checks the session, enforces the role, and draws the floating pill navigation. */
export function AppShell({ role, children }: { role?: User["role"]; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/signin");
      return;
    }
    try {
      const { user: me } = await api<{ user: User }>("/api/me");
      if (role && me.role !== role) router.replace(homeFor(me));
      else setUser(me);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [role, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  }
  if (!user) return <Loading />;

  return (
    <Ctx.Provider value={{ user, setUser }}>
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 bg-paper/80 px-4 backdrop-blur sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="mr-1 hidden text-sm text-muted sm:inline">{user.name}</span>
            <ThemeToggle />
            <IconButton label="Sign out" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </header>
        <main className="rise flex-1 px-4 pb-32 pt-2 sm:px-6">{children}</main>
        <nav className="fixed inset-x-0 bottom-4 z-20 mx-auto w-fit pb-[env(safe-area-inset-bottom)]" aria-label="Main">
          <ul className="flex items-center gap-1.5 rounded-full bg-card/90 p-2 shadow-[var(--shadow-float)] backdrop-blur">
            {NAV[user.role].map(({ href, label, icon: Icon, ...rest }) => {
              const active = "exact" in rest ? path === href : path.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-12 items-center justify-center gap-2 rounded-full px-3.5 text-sm transition-colors sm:px-5 ${active ? "bg-night text-white" : "bg-raised/80 text-ink hover:brightness-105"}`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </Ctx.Provider>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-light tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
