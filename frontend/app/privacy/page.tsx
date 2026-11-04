import type { Metadata } from "next";
import { Logo } from "@/components/Shell";

export const metadata: Metadata = { title: "Privacy" };

const SECTIONS = [
  ["What we store", "Your name, email and a salted hash of your password. Any profile details you add, such as your roll number or department. Which sessions you attended, when, and whether that was by face or by hand. If you enrol your face, a face template: 128 numbers calculated from your photos."],
  ["What we don't store", "Photos and video. Camera frames travel to the server over an encrypted connection, are read once in memory, and are discarded. The small previews during enrolment stay on your own device."],
  ["Who can see what", "A teacher sees the students who joined their class, including name, email, profile details and attendance in that class. Students see only their own record. Nobody can see a face template through the app: it's used only inside the server to compare faces."],
  ["Consent", "A face template is only created after you tick the consent box on the enrolment page. You don't have to enrol. Your teacher can always mark you present by hand instead."],
  ["Deleting your data", "Settings and the My face page let you delete your face template or your entire account at any time. Deleting your account removes your attendance records too. If you're a teacher, it also removes your classes and their registers, so export anything you need first."],
  ["Limits worth knowing", "Face matching can make mistakes, and it can't always tell a live person from a good photo. Teachers should keep an eye on the camera and correct the register by hand when needed."],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="flex h-20 items-center"><Logo /></header>
      <main>
        <h1 className="text-4xl font-light tracking-tight">Privacy notice</h1>
        <p className="mt-3 text-lg text-muted">Face data is sensitive, so here is plainly what Rollcall does with it.</p>
        <div className="mt-8 space-y-7">
          {SECTIONS.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-xl font-normal">{title}</h2>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
