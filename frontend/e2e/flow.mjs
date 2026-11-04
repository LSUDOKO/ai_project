// Drives the whole product in real browsers, with a fake camera feed for each person:
// teacher creates a class, students join and enrol, a live session marks them, everyone checks the result.
//
//   FACE_DIR=<dir with p1.y4m p2.y4m p3.y4m room.y4m> BASE_URL=http://localhost:3000 API_URL=http://localhost:5000 node e2e/flow.mjs
//
// SHOTS=<dir> saves screenshots, VIDEO=<dir> records each browser, KEEP=1 leaves the test accounts in place.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:5000";
const FACES = process.env.FACE_DIR;
const SHOTS = process.env.SHOTS;
const VIDEO = process.env.VIDEO;
const RUN = Date.now().toString(36);
const PASSWORD = "classroom-pass-1";
const DESKTOP = { width: 1280, height: 860 };
const PHONE = { width: 390, height: 844 };
// A sleeping free-tier backend can take about a minute to answer its first request.
const SLOW = 120_000;

const browsers = [];
const accounts = [];
const step = (text) => console.log(`  ok  ${text}`);

async function person(name, face, viewport = DESKTOP) {
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${path.join(FACES, face)}`],
  });
  browsers.push(browser);
  const context = await browser.newContext({
    viewport,
    acceptDownloads: true,
    permissions: ["camera", "clipboard-read", "clipboard-write"],
    ...(VIDEO ? { recordVideo: { dir: path.join(VIDEO, name), size: viewport } } : {}),
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`${name}: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/status of 4\d\d/.test(msg.text())) problems.push(`${name}: ${msg.text()}`);
  });
  page.setDefaultTimeout(SLOW);
  return { page, problems, name, email: `e2e-${name.toLowerCase()}-${RUN}@example.com`, password: PASSWORD };
}

const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(900); // Let the page's entrance animation finish.
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

async function signUp({ page, name, email, password }, url, displayName) {
  await page.goto(`${BASE}${url}`);
  await page.getByLabel("Full name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  accounts.push({ email, password });
  await page.waitForURL(/\/(student|teacher)$/);
  step(`${name} signed up`);
}

async function enrolFace({ page, name }, { screenshots = false } = {}) {
  await page.goto(`${BASE}/student/face`);
  await page.getByRole("button", { name: "Start camera" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Start camera" }).isDisabled(), true, "camera must wait for consent");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start camera" }).click();
  for (let shotNumber = 1; shotNumber <= 5; shotNumber++) {
    await page.getByText(`Photo ${shotNumber} of 5`).waitFor();
    if (screenshots && shotNumber === 3) await shot(page, "student-enrol");
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await page.getByText(shotNumber < 5 ? `Photo ${shotNumber + 1} of 5` : "All five taken").waitFor();
  }
  await page.getByRole("button", { name: "Save my face" }).click();
  await page.getByRole("button", { name: "Delete face data" }).waitFor();
  step(`${name} enrolled their face`);
}

async function run() {
  const teacher = await person("Teacher", "room.y4m");
  const asha = await person("Asha", "p1.y4m", PHONE);
  const daniel = await person("Daniel", "p2.y4m", PHONE);
  const mei = await person("Mei", "p3.y4m", PHONE);

  await teacher.page.goto(BASE);
  await teacher.page.getByRole("heading", { name: /Stop calling names/ }).waitFor();
  await shot(teacher.page, "landing");

  // Teacher creates a class.
  await signUp(teacher, "/signup?role=teacher", "Priya Sharma");
  await teacher.page.getByText("Create your first class").waitFor();
  await teacher.page.getByRole("button", { name: "New class" }).first().click();
  await teacher.page.getByLabel(/Class name/).fill("CSE Section B");
  await teacher.page.getByLabel(/Subject/).fill("Data Structures");
  await teacher.page.getByRole("button", { name: "Create class" }).click();
  await teacher.page.waitForURL(/\/teacher\/class\/\d+/);
  const code = (await teacher.page.getByTestId("join-code").innerText()).trim();
  assert.match(code, /^[A-Z2-9]{6}$/);
  step(`teacher created a class, code ${code}`);

  // Asha arrives through the invite link and is added automatically.
  await signUp(asha, `/signup?role=student&code=${code}`, "Asha Verma");
  await asha.page.getByRole("heading", { name: /CSE Section B/ }).waitFor();
  step("invite link joined the class automatically");
  await shot(asha.page, "student-home");

  await asha.page.goto(`${BASE}/settings`);
  await asha.page.getByLabel("Roll number").fill("CSE-041");
  await asha.page.getByLabel("Year").fill("3rd Year");
  await asha.page.getByRole("button", { name: "Save profile" }).click();
  await asha.page.getByText("Saved").waitFor();
  await asha.page.reload();
  assert.equal(await asha.page.getByLabel("Roll number").inputValue(), "CSE-041");
  step("profile saves and persists");

  await enrolFace(asha, { screenshots: true });
  await asha.page.getByRole("button", { name: "Start camera" }).click();
  await asha.page.getByRole("button", { name: "Test now" }).click();
  await asha.page.getByText(/That's you/).waitFor();
  await shot(asha.page, "student-face-test");
  step("test recognition knows Asha");

  // Daniel types the code by hand. A wrong code gets a clear message first.
  await signUp(daniel, "/signup", "Daniel Mensah");
  await daniel.page.getByLabel("Class code").fill("ZZZZZZ");
  await daniel.page.getByRole("button", { name: "Join class" }).click();
  await daniel.page.getByText(/No class has that code/).waitFor();
  await daniel.page.getByLabel("Class code").fill(code);
  await daniel.page.getByRole("button", { name: "Join class" }).click();
  await daniel.page.getByRole("heading", { name: /CSE Section B/ }).waitFor();
  await enrolFace(daniel);

  // Mei joins but never enrols, so she can only be marked by hand.
  await signUp(mei, `/signup?role=student&code=${code}`, "Mei Tan");
  await mei.page.getByRole("heading", { name: /CSE Section B/ }).waitFor();

  // Students can't open teacher pages.
  await asha.page.goto(`${BASE}/teacher`);
  await asha.page.waitForURL(/\/student$/);
  step("student is redirected away from teacher pages");

  // Roster reflects all of that.
  await teacher.page.reload();
  await teacher.page.getByText("Asha Verma").waitFor();
  await teacher.page.getByText("Mei Tan").waitFor();
  await teacher.page.getByText("No face yet").waitFor();
  await shot(teacher.page, "teacher-class");
  step("teacher sees the roster with enrolment status");

  // Teacher edits a student's details.
  await teacher.page.getByRole("button", { name: "Edit Mei Tan" }).click();
  await teacher.page.getByLabel("Roll number").fill("CSE-077");
  await teacher.page.getByRole("button", { name: "Save", exact: true }).click();
  await teacher.page.getByText(/CSE-077/).waitFor();
  step("teacher can edit a student");

  // Live session: the room camera cycles through Asha, Daniel and a stranger.
  await teacher.page.getByRole("button", { name: "Start session" }).click();
  await teacher.page.getByLabel(/Topic/).fill("Binary trees");
  await teacher.page.getByRole("dialog").getByRole("button", { name: "Start session" }).click();
  await teacher.page.waitForURL(/\/teacher\/session\/\d+/);
  await teacher.page.getByRole("button", { name: "Start scanning" }).click();
  await teacher.page.getByRole("switch", { name: "Asha Verma: present" }).waitFor();
  step("camera marked Asha present");
  await shot(teacher.page, "teacher-session-live");
  await teacher.page.getByRole("switch", { name: "Daniel Mensah: present" }).waitFor();
  step("camera marked Daniel present");
  await teacher.page.getByText("Not recognised").waitFor();
  await shot(teacher.page, "teacher-session-unknown");
  step("a stranger in the room stays unrecognised");
  assert.equal(await teacher.page.getByRole("switch", { name: "Mei Tan: absent" }).count(), 1, "Mei must not be marked by camera");

  // Manual correction, then end.
  await teacher.page.getByRole("switch", { name: "Mei Tan: absent" }).click();
  await teacher.page.getByRole("switch", { name: "Mei Tan: present" }).waitFor();
  await teacher.page.getByRole("switch", { name: "Mei Tan: present" }).click();
  await teacher.page.getByRole("switch", { name: "Mei Tan: absent" }).waitFor();
  await teacher.page.getByRole("button", { name: "End session" }).click();
  await teacher.page.getByRole("dialog").getByRole("button", { name: "End session" }).click();
  await teacher.page.getByText("Finished").waitFor();
  assert.match(await teacher.page.getByTestId("present-count").innerText(), /2\s+of 3 present/);
  await shot(teacher.page, "teacher-session-summary");
  step("session ended with 2 of 3 present");

  const [sessionFile] = await Promise.all([teacher.page.waitForEvent("download"), teacher.page.getByRole("button", { name: "Export to Excel" }).click()]);
  const sessionCsv = await readFile(await sessionFile.path(), "utf8");
  assert.match(sessionCsv, /"Asha Verma","CSE-041".*"Present"/);
  assert.match(sessionCsv, /"Mei Tan","CSE-077".*"Absent"/);
  step("session export has the right rows");

  await teacher.page.getByRole("link", { name: /CSE Section B/ }).click();
  await teacher.page.waitForURL(/\/teacher\/class\/\d+/);
  const [classFile] = await Promise.all([teacher.page.waitForEvent("download"), teacher.page.getByRole("button", { name: "Export to Excel" }).click()]);
  const classCsv = await readFile(await classFile.path(), "utf8");
  assert.match(classCsv, /"Daniel Mensah".*"P"/);
  assert.match(classCsv, /"Mei Tan","CSE-077".*"A"/);
  step("class register export has the right rows");

  // Each student sees their own result.
  await asha.page.goto(`${BASE}/student/attendance`);
  await asha.page.getByText("Binary trees").waitFor();
  assert.equal(await asha.page.getByText("Present", { exact: true }).count(), 2, "stat label plus one present row");
  await shot(asha.page, "student-attendance");
  const [studentFile] = await Promise.all([asha.page.waitForEvent("download"), asha.page.getByRole("button", { name: "Export to Excel" }).click()]);
  assert.match(await readFile(await studentFile.path(), "utf8"), /"Present"/);
  step("Asha sees herself present and can export");

  await mei.page.goto(`${BASE}/student/attendance`);
  await mei.page.getByText("Binary trees").waitFor();
  assert.equal(await mei.page.getByText("Absent", { exact: true }).count(), 2, "stat label plus one absent row");
  step("Mei sees herself absent");

  // Teacher overview and dark theme, for the record.
  await teacher.page.goto(`${BASE}/teacher`);
  await teacher.page.getByText("Recent sessions").waitFor();
  await shot(teacher.page, "teacher-home");
  await teacher.page.getByRole("button", { name: "Switch to dark theme" }).click();
  await shot(teacher.page, "teacher-home-dark");
  await teacher.page.getByRole("button", { name: "Switch to light theme" }).click();

  // Password change signs in with the new password only.
  const newPassword = "another-pass-22";
  await daniel.page.goto(`${BASE}/settings`);
  await daniel.page.getByLabel("Current password").fill(PASSWORD);
  await daniel.page.getByLabel("New password").fill(newPassword);
  await daniel.page.getByRole("button", { name: "Change password" }).click();
  await daniel.page.getByText(/Other devices have been signed out/).waitFor();
  await daniel.page.getByRole("button", { name: "Sign out" }).click();
  await daniel.page.waitForURL(`${BASE}/`);
  await daniel.page.goto(`${BASE}/signin`);
  await daniel.page.getByLabel("Email").fill(daniel.email);
  await daniel.page.getByLabel("Password").fill(PASSWORD);
  await daniel.page.getByRole("button", { name: "Sign in" }).click();
  await daniel.page.getByText("Incorrect email or password").waitFor();
  await daniel.page.getByLabel("Password").fill(newPassword);
  await daniel.page.getByRole("button", { name: "Sign in" }).click();
  await daniel.page.waitForURL(/\/student$/);
  accounts.find((a) => a.email === daniel.email).password = newPassword;
  step("password change works");

  // Deleting face data, then the account.
  await mei.page.goto(`${BASE}/settings`);
  await mei.page.getByRole("button", { name: "Delete my account" }).click();
  await mei.page.getByRole("dialog").getByLabel("Password").fill(PASSWORD);
  await mei.page.getByRole("button", { name: "Delete permanently" }).click();
  await mei.page.waitForURL(`${BASE}/`);
  accounts.splice(accounts.findIndex((a) => a.email === mei.email), 1);
  step("a student can delete their account");

  await asha.page.goto(`${BASE}/student/face`);
  await asha.page.getByRole("button", { name: "Delete face data" }).click();
  await asha.page.getByRole("dialog").getByRole("button", { name: "Delete face data" }).click();
  await asha.page.getByRole("checkbox").waitFor();
  step("a student can delete their face data");

  const problems = [teacher, asha, daniel, mei].flatMap((p) => p.problems);
  assert.deepEqual(problems, [], "browser console should stay clean");
}

async function cleanup() {
  if (process.env.KEEP) return;
  for (const { email, password } of accounts) {
    try {
      const signin = await fetch(`${API}/api/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const { token } = await signin.json();
      await fetch(`${API}/api/me`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) });
    } catch (err) {
      console.error(`Could not remove ${email}: ${err.message}`);
    }
  }
}

let failed = false;
try {
  await run();
  console.log("\nFull flow passed.");
} catch (err) {
  failed = true;
  console.error("\nFLOW FAILED:", err.message);
  for (const browser of browsers) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) console.error(`  open page: ${page.url()}`);
    }
  }
} finally {
  await cleanup();
  await Promise.all(browsers.flatMap((b) => b.contexts().map((c) => c.close())));
  await Promise.all(browsers.map((b) => b.close()));
}
process.exit(failed ? 1 : 0);
