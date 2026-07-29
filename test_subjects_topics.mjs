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

  // 2. Check subject/topic counts for EACH exam
  console.log("\n=== SUBJECTS & TOPICS BY EXAM ===");
  let totalSubjects = 0;
  let totalTopics = 0;

  for (const exam of exams) {
    const subjResp = await apiFetch("/api/admin", {
      action: "list-subjects",
      exam_id: exam.id,
    });
    const subjects = subjResp.ok ? (subjResp.data.subjects ?? []) : [];
    totalSubjects += subjects.length;

    let examTopics = 0;
    for (const s of subjects) {
      const chapResp = await apiFetch("/api/admin", {
        action: "list-chapters",
        subject_id: s.id,
      });
      const chapters = chapResp.ok ? (chapResp.data.chapters ?? []) : [];
      for (const c of chapters) {
        const topResp = await apiFetch("/api/admin", {
          action: "list-topics",
          chapter_id: c.id,
        });
        const topics = topResp.ok ? (topResp.data.topics ?? []) : [];
        examTopics += topics.length;
      }
    }

    if (subjects.length > 0 || examTopics > 0) {
      console.log(`  "${exam.name}": ${subjects.length} subjects, ${examTopics} topics`);
    }
  }

  console.log(`\nTOTAL: ${totalSubjects} subjects, ${totalTopics} topics across ${exams.length} exams`);

  // 3. If an exam name was provided, show details for that exam
  const examName = process.argv[2];
  if (examName) {
    const exam = exams.find(e => e.name.toLowerCase() === examName.toLowerCase());
    if (!exam) { console.error(`\nExam "${examName}" not found`); return; }

    console.log(`\n=== DETAILS for "${exam.name}" ===`);
    const subjResp = await apiFetch("/api/admin", {
      action: "list-subjects",
      exam_id: exam.id,
    });
    const subjects = subjResp.ok ? (subjResp.data.subjects ?? []) : [];
    console.log(`${subjects.length} subjects:`);

    for (const s of subjects) {
      console.log(`\n  Subject: ${s.name}`);
      const chapResp = await apiFetch("/api/admin", {
        action: "list-chapters",
        subject_id: s.id,
      });
      const chapters = chapResp.ok ? (chapResp.data.chapters ?? []) : [];
      for (const c of chapters) {
        console.log(`    Chapter: ${c.name}`);
        const topResp = await apiFetch("/api/admin", {
          action: "list-topics",
          chapter_id: c.id,
        });
        const topics = topResp.ok ? (topResp.data.topics ?? []) : [];
        for (const t of topics) {
          console.log(`      Topic: ${t.name}`);
        }
      }
    }
  } else {
    console.log("\n(To see full details for a specific exam, run: node test_subjects_topics.mjs \"Exam Name\")");
  }

  console.log("\n=== DONE ===");
}

main().catch(err => console.error("FATAL:", err.message));
