import { Logo } from "@/components/Shell";
import { ButtonLink, ThemeToggle } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10">
      <header className="flex h-20 items-center justify-between"><Logo /><ThemeToggle /></header>
      <main className="lg:my-auto lg:pb-20">
        <h1 className="text-4xl font-light tracking-tight">Absent.</h1>
        <p className="mb-6 mt-3 text-muted">This page isn&apos;t here. It may have moved, or the link may be wrong.</p>
        <ButtonLink href="/">Back to the start</ButtonLink>
      </main>
    </div>
  );
}
