// Verify subjects, chapters, and topics were created in examprep after upload
const BASE = "https://examprep-web-mu.vercel.app";
const EMAIL = "sagar.butla@gmail.com";
const PASSWORD = "12345678";

let cookies = "";

async function apiFetch(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (cookies) headers["Cookie"] = cookies;

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    cookies = setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function login() {
  const { ok } = await apiFetch("/api/auth", {
    action: "login",
    email: EMAIL,
    password: PASSWORD,
  });
  if (!ok) throw new Error("Login failed");
  console.log("Logged in to examprep");
}

async function main() {
  await login();

  // 1. List exams
  console.log("\n=== EXAMS ===");
  const examsResp = await apiFetch("/api/admin", { action: "list-exams" });
  if (!examsResp.ok) { console.error("Failed to list exams"); return; }
  const exams = examsResp.data.exams ?? [];
  console.log(`Found ${exams.length} exams:`);
  for (const e of exams.slice(0, 5)) {
    console.log(`  - ${e.name} (${e.id})`);
  }
  if (exams.length > 5) console.log(`  ... and ${exams.length - 5} more`);

  // Prompt for exam name or use first one
  const examName = process.argv[2] || exams[0]?.name;
  if (!examName) { console.error("No exams found"); return; }
  const exam = exams.find(e => e.name.toLowerCase() === examName.toLowerCase());
  if (!exam) { console.error(`Exam "${examName}" not found`); return; }

  // 2. List subjects for this exam
  console.log(`\n=== SUBJECTS for "${exam.name}" ===`);
  const subjResp = await apiFetch("/api/admin", {
    action: "list-subjects",
    exam_id: exam.id,
  });
  if (!subjResp.ok) { console.error("Failed to list subjects"); return; }
  const subjects = subjResp.data.subjects ?? [];
  console.log(`Found ${subjects.length} subjects:`);
  for (const s of subjects) {
    console.log(`  - ${s.name} (${s.id})`);
  }

  if (subjects.length === 0) {
    console.log("\n⚠ No subjects found. Make sure you've uploaded papers with topic data.");
    return;
  }

  // 3. For each subject, list chapters
  for (const s of subjects) {
    console.log(`\n=== CHAPTERS under "${s.name}" ===`);
    const chapResp = await apiFetch("/api/admin", {
      action: "list-chapters",
      subject_id: s.id,
    });
    if (!chapResp.ok) { console.error(`  Failed to list chapters for ${s.name}`); continue; }
    const chapters = chapResp.data.chapters ?? [];
    console.log(`  Found ${chapters.length} chapters:`);
    for (const c of chapters) {
      console.log(`    - ${c.name} (${c.id})`);

      // 4. For each chapter, list topics
      const topResp = await apiFetch("/api/admin", {
        action: "list-topics",
        chapter_id: c.id,
      });
      if (!topResp.ok) { console.error(`      Failed to list topics for ${c.name}`); continue; }
      const topics = topResp.data.topics ?? [];
      if (topics.length > 0) {
        console.log(`      Topics (${topics.length}):`);
        for (const t of topics) {
          console.log(`        - ${t.name} (${t.id})`);
        }
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(err => console.error("FATAL:", err.message));
