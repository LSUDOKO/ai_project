import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import { WakeBanner } from "@/components/WakeBanner";
import "./globals.css";

const font = Public_Sans({ variable: "--font-public", subsets: ["latin"], weight: ["300", "400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "Rollcall: attendance at a glance", template: "%s · Rollcall" },
  description: "Face recognition attendance for real classrooms. Students enrol once, teachers point a camera, and the register fills itself. No photos stored.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dde9da" },
    { media: "(prefers-color-scheme: dark)", color: "#131a15" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Runs before first paint so the saved theme never flashes. */
const THEME_BOOT = `(function(){var e=document.documentElement,t=null;try{t=localStorage.getItem("rollcall-theme")}catch(_){}e.dataset.theme=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${font.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <WakeBanner />
      </body>
    </html>
  );
}
