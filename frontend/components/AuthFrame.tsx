"use client";
import type { ReactNode } from "react";
import { Logo } from "./Shell";
import { Panel, ThemeToggle } from "./ui";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10">
      <header className="flex h-20 items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="rise lg:my-auto lg:pb-20">
        <h1 className="text-4xl font-light tracking-tight">{title}</h1>
        <p className="mb-6 mt-2 text-muted">{subtitle}</p>
        <Panel>{children}</Panel>
      </main>
    </div>
  );
}
