const EXAMPPREP_BASE_URL = "https://examprep-web-mu.vercel.app";
const EXAMPPREP_EMAIL = "sagar.butla@gmail.com";
const EXAMPPREP_PASSWORD = "12345678";

let authCookieHeader = "";
let authCookies: string[] = [];

async function examprepFetch(
  path: string,
  body: Record<string, unknown>,
  retryOn401 = true,
  maxRetries = 3,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authCookieHeader) {
    headers["Cookie"] = authCookieHeader;
  }

  const url = `${EXAMPPREP_BASE_URL}${path}`;
  const action = (body.action as string) ?? "unknown";

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err;
      console.error(`[examprepFetch] Network error (attempt ${attempt + 1}/${maxRetries}) for ${action} ${path}:`, err instanceof Error ? err.message : err);
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return {
        ok: false,
        status: 502,
        data: { error: err instanceof Error ? err.message : "Upstream unreachable" },
      };
    }

    if (res.status === 401 && retryOn401) {
      console.warn(`[examprepFetch] Got 401 for ${action} ${path}, re-logging in...`);
      authCookieHeader = "";
      authCookies = [];
      const loggedIn = await loginExamprep();
      if (loggedIn) {
        console.log(`[examprepFetch] Re-login successful, retrying ${action}...`);
        return examprepFetch(path, body, false);
      }
      console.error(`[examprepFetch] Re-login failed for ${action}`);
    }

    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length > 0) {
      authCookies = setCookie;
      authCookieHeader = authCookies.map((c) => c.split(";")[0]).join("; ");
    }

    let data: unknown;
    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      console.warn(`[examprepFetch] Non-JSON response for ${action} ${path}: status=${res.status}, contentType="${contentType}", body=${text.slice(0, 200)}`);
      data = text ? { error: text } : null;
    }

    if (!res.ok) {
      console.error(`[examprepFetch] HTTP ${res.status} for ${action} ${path}:`, JSON.stringify(data).slice(0, 300));
    }

    return { ok: res.ok, status: res.status, data };
  }

  return {
    ok: false,
    status: 502,
    data: { error: lastError instanceof Error ? lastError.message : "All retries exhausted" },
  };
}

export async function loginExamprep(): Promise<boolean> {
  const { ok } = await examprepFetch(
    "/api/auth",
    {
      action: "login",
      email: EXAMPPREP_EMAIL,
      password: EXAMPPREP_PASSWORD,
    },
    false,
  );
  return ok;
}

async function ensureLogin(): Promise<void> {
  if (authCookieHeader) return;
  const ok = await loginExamprep();
  if (!ok) throw new Error("Failed to login to examprep");
}

export function mapSuperGroupToCategory(superGroupName: string): string {
  const name = superGroupName.toLowerCase().trim();
  if (/upsc|ias|ips|ifs|irs| civil/i.test(name)) return "civil_services";
  if (/ssc|state\s*psc|pcs|mpsc|uppsc|bpsc/i.test(name)) return "state_psc";
  if (/bank|ibps|sbi|rbi|insurance|lic/i.test(name)) return "banking";
  if (/railway|rrb|rrc/i.test(name)) return "railways";
  if (/defence|defense|army|navy|air\s*force|nda|cds|afcat/i.test(name)) return "defence";
  if (/teach|ctet|tet|dsssb|kvs|nvs|ugc\s*net/i.test(name)) return "teaching";
  if (/engineer|jee|gate|ese|ies/i.test(name)) return "engineering";
  if (/medical|neet|aiims|pgimer|fmge/i.test(name)) return "medical";
  if (/\blaw\b|clat|ailet|lsat/i.test(name)) return "law";
  if (/management|cat|mat|xat|cmat|mba|business/i.test(name)) return "management";
  return "other";
}

export async function listExams(): Promise<Array<{ id: string; name: string; slug: string }>> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", { action: "list-exams" });
  if (!ok) throw new Error("Failed to list exams");
  return ((data as Record<string, unknown>)?.exams as Array<Record<string, unknown>>)?.map((e) => ({
    id: e.id as string,
    name: e.name as string,
    slug: e.slug as string,
  })) ?? [];
}

export async function createExam(name: string, category = "other"): Promise<string> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-exam",
    name,
    category,
    is_active: true,
    display_order: 0,
  });
  if (!ok) throw new Error(`Failed to create exam: ${JSON.stringify(data)}`);
  return ((data as Record<string, unknown>)?.exam as Record<string, unknown>)?.id as string;
}

export async function listPaperTypes(
  examId: string,
): Promise<Array<{ id: string; name: string; stage: string }>> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-paper-types",
    exam_id: examId,
  });
  if (!ok) throw new Error("Failed to list paper types");
  return (
    ((data as Record<string, unknown>)?.paper_types as Array<Record<string, unknown>>)?.map(
      (pt) => ({
        id: pt.id as string,
        name: pt.name as string,
        stage: pt.stage as string,
      }),
    ) ?? []
  );
}

export async function createPaperType(
  examId: string,
  name: string,
  stage: string,
  durationMinutes = 180,
): Promise<string> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-paper-type",
    exam_id: examId,
    name,
    stage,
    duration_minutes: durationMinutes,
    total_marks: 100,
    total_questions: 100,
    negative_marking: 0,
    display_order: 0,
  });
  if (!ok) throw new Error(`Failed to create paper type: ${JSON.stringify(data)}`);
  return ((data as Record<string, unknown>)?.paper_type as Record<string, unknown>)?.id as string;
}

export async function updatePaperType(
  id: string,
  data: Partial<{
    duration_minutes: number;
    total_marks: number;
    total_questions: number;
  }>,
): Promise<void> {
  await ensureLogin();
  const { ok } = await examprepFetch("/api/admin", {
    action: "update-paper-type",
    id,
    ...data,
  });
  if (!ok) throw new Error("Failed to update paper type metrics");
}

export async function listPaperInstances(
  paperTypeId: string,
): Promise<Array<{ id: string; year: number; session: string | null; shift: string | null; display_name: string }>> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-paper-instances",
    paper_type_id: paperTypeId,
  });
  if (!ok) throw new Error("Failed to list paper instances");
  return (
    ((data as Record<string, unknown>)?.paper_instances as Array<Record<string, unknown>>)?.map(
      (pi) => ({
        id: pi.id as string,
        year: pi.year as number,
        session: (pi.session as string) ?? null,
        shift: (pi.shift as string) ?? null,
        display_name: pi.display_name as string,
      }),
    ) ?? []
  );
}

export async function createPaperInstance(
  paperTypeId: string,
  year: number,
  displayName: string,
  session?: string | null,
  shift?: string | null,
): Promise<string> {
  await ensureLogin();
  const body: Record<string, unknown> = {
    action: "create-paper-instance",
    paper_type_id: paperTypeId,
    year,
    display_name: displayName,
  };
  if (session) body.session = session;
  if (shift) body.shift = shift;
  const { ok, data } = await examprepFetch("/api/admin", body);
  if (!ok) throw new Error(`Failed to create paper instance: ${JSON.stringify(data)}`);
  return ((data as Record<string, unknown>)?.paper_instance as Record<string, unknown>)
    ?.id as string;
}

export interface CsvQuestion {
  question_number?: number;
  question_text: string;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  correct_option: string;
  solution_text?: string;
  difficulty?: string;
  marks?: number;
  negative_marks?: number;
  topic_subject?: string;
  topic_category?: string;
  topic_type?: string;
  subject_id?: string;
  topic_id?: string;
}

export interface BulkImportResult {
  imported: number;
  errors: string[];
}

export async function bulkImportQuestions(
  questions: CsvQuestion[],
  paperInstanceId: string,
): Promise<BulkImportResult> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "bulk-import-questions",
    questions,
    paper_instance_id: paperInstanceId,
  });
  if (!ok) throw new Error(`Failed to import questions: ${JSON.stringify(data)}`);
  return data as BulkImportResult;
}

export async function createQuestion(
  question: CsvQuestion,
  paperInstanceId: string,
): Promise<string> {
  await ensureLogin();
  const body: Record<string, unknown> = {
    action: "create-question",
    paper_instance_id: paperInstanceId,
    question_number: question.question_number,
    question_text: question.question_text,
    correct_option: question.correct_option,
  };
  if (question.option_a != null) body.option_a = question.option_a;
  if (question.option_b != null) body.option_b = question.option_b;
  if (question.option_c != null) body.option_c = question.option_c;
  if (question.option_d != null) body.option_d = question.option_d;
  if (question.solution_text) body.solution_text = question.solution_text;
  if (question.difficulty) body.difficulty = question.difficulty;
  if (typeof question.marks === "number") body.marks = question.marks;
  if (typeof question.negative_marks === "number") body.negative_marks = question.negative_marks;
  if (question.subject_id) body.subject_id = question.subject_id;
  if (question.topic_id) body.topic_id = question.topic_id;
  if (question.topic_subject) body.topic_subject = question.topic_subject;
  if (question.topic_category) body.topic_category = question.topic_category;

  if (question.topic_id) {
    console.log(`[createQuestion] Q${question.question_number}: sending topic_id="${question.topic_id}"`);
  }

  const { ok, data } = await examprepFetch("/api/admin", body);
  if (!ok) throw new Error(`Failed to create question: ${JSON.stringify(data)}`);
  return ((data as Record<string, unknown>)?.question as Record<string, unknown>)?.id as string;
}

// ── Subject / Chapter / Topic management ───────────────────

export interface ExamprepSubject {
  id: string;
  exam_id: string;
  name: string;
}

export interface ExamprepChapter {
  id: string;
  subject_id: string;
  name: string;
}

export interface ExamprepTopic {
  id: string;
  chapter_id: string;
  name: string;
}

export async function listSubjects(examId: string): Promise<ExamprepSubject[]> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-subjects",
    exam_id: examId,
  });
  if (!ok) throw new Error("Failed to list subjects");
  return ((data as Record<string, unknown>)?.subjects as Array<Record<string, unknown>>)?.map((s) => ({
    id: s.id as string,
    exam_id: s.exam_id as string,
    name: s.name as string,
  })) ?? [];
}

export async function createSubject(name: string, examId: string): Promise<ExamprepSubject> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-subject",
    name,
    exam_id: examId,
  });
  if (!ok) throw new Error(`Failed to create subject: ${JSON.stringify(data)}`);
  const subject = (data as Record<string, unknown>)?.subject as Record<string, unknown>;
  return { id: subject.id as string, exam_id: subject.exam_id as string, name: subject.name as string };
}

export async function listChapters(subjectId: string): Promise<ExamprepChapter[]> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-chapters",
    subject_id: subjectId,
  });
  if (!ok) throw new Error("Failed to list chapters");
  return ((data as Record<string, unknown>)?.chapters as Array<Record<string, unknown>>)?.map((c) => ({
    id: c.id as string,
    subject_id: c.subject_id as string,
    name: c.name as string,
  })) ?? [];
}

export async function createChapter(name: string, subjectId: string): Promise<ExamprepChapter> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-chapter",
    name,
    subject_id: subjectId,
  });
  if (!ok) throw new Error(`Failed to create chapter: ${JSON.stringify(data)}`);
  const chapter = (data as Record<string, unknown>)?.chapter as Record<string, unknown>;
  return { id: chapter.id as string, subject_id: chapter.subject_id as string, name: chapter.name as string };
}

export async function listTopics(chapterId: string): Promise<ExamprepTopic[]> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-topics",
    chapter_id: chapterId,
  });
  if (!ok) throw new Error("Failed to list topics");
  return ((data as Record<string, unknown>)?.topics as Array<Record<string, unknown>>)?.map((t) => ({
    id: t.id as string,
    chapter_id: t.chapter_id as string,
    name: t.name as string,
  })) ?? [];
}

export async function createTopic(name: string, chapterId: string): Promise<ExamprepTopic> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-topic",
    name,
    chapter_id: chapterId,
  });
  if (!ok) throw new Error(`Failed to create topic: ${JSON.stringify(data)}`);
  const topic = (data as Record<string, unknown>)?.topic as Record<string, unknown>;
  return { id: topic.id as string, chapter_id: topic.chapter_id as string, name: topic.name as string };
}

// ── Paper type detection ───────────────────────────────────

export function detectPaperType(title: string): { stage: string; name: string } {
  const t = title.toLowerCase().trim();
  const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
  const romanLabels = ["", "I", "II", "III", "IV"];

  function extractPaperNum(s: string): number | undefined {
    const m = s.match(/paper\s*[-\s]?\s*(?:([1-4])|(i|ii|iii|iv))\b/i);
    if (!m) return undefined;
    if (m[1]) return parseInt(m[1]);
    return romanMap[m[2].toLowerCase()] ?? undefined;
  }

  const tierMatch = t.match(/tier\s*[-\s]?\s*(?:([1-4])|(i|ii|iii|iv))\b/i);
  if (tierMatch) {
    const num = tierMatch[1]
      ? parseInt(tierMatch[1])
      : romanMap[tierMatch[2].toLowerCase()] ?? 1;
    return { stage: `tier${num}`, name: `Tier-${romanLabels[num]}` };
  }

  if (t.match(/\bprelims\b|\bpreliminary\b|pre\s*\.?\s*exam\b/i)) {
    const pn = extractPaperNum(t);
    const name = pn ? `Prelims Paper-${romanLabels[pn]}` : "Prelims";
    return { stage: "prelims", name };
  }

  if (t.match(/\bmains\b|\bmain\s*exam\b/i)) {
    const pn = extractPaperNum(t);
    const name = pn ? `Mains Paper-${romanLabels[pn]}` : "Mains";
    return { stage: "mains", name };
  }

  const paperMatch = t.match(/paper\s*[-\s]?\s*(?:([1-4])|(i|ii|iii|iv))\b/i);
  if (paperMatch) {
    const num = paperMatch[1]
      ? parseInt(paperMatch[1])
      : romanMap[paperMatch[2].toLowerCase()] ?? 1;
    return { stage: "single", name: `Paper-${romanLabels[num]}` };
  }

  const stageMatch = t.match(/stage\s*[-\s]?\s*([1-4])\b/i);
  if (stageMatch) {
    return { stage: "single", name: `Stage-${romanLabels[parseInt(stageMatch[1])]}` };
  }

  return { stage: "single", name: "Single" };
}

// ── Session / Shift / Display-name helpers ─────────────────

const SESSION_ORDINALS: Record<number, string> = {
  1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
  6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
  11: "Eleventh", 12: "Twelfth", 13: "Thirteenth", 14: "Fourteenth",
  15: "Fifteenth", 16: "Sixteenth", 17: "Seventeenth", 18: "Eighteenth",
  19: "Nineteenth", 20: "Twentieth",
};

function sessionOrdinal(n: number): string {
  return SESSION_ORDINALS[n] ?? `${n}th`;
}

export interface PaperInput {
  id: string;
  year: number;
  examDate: string;
  displayName: string;
  durationMinutes: number;
}

export interface AssignedPaper {
  paperId: string;
  year: number;
  session: string | null;
  shift: string | null;
  shiftNumber: number;
  displayName: string;
  durationMinutes: number;
}

/**
 * Formats the paper-type name stored on examprep:
 *   Multiple types → "SSC CGL Tier-I"
 *   Single type    → "SSC CGL"
 */
export function formatPaperTypeName(
  examName: string,
  detectedName: string,
  hasMultipleTypes: boolean,
): string {
  if (!hasMultipleTypes || detectedName === "Single") return examName;
  return `${examName} ${detectedName}`;
}

/**
 * Builds the instance display_name:
 *   "{year} {examName} [{detectedName}] Shift {shiftNumber}"
 * where the detectedName part is included only when multiple paper types exist.
 */
function formatDisplayName(
  year: number,
  examName: string,
  detectedName: string,
  hasMultipleTypes: boolean,
  shiftNumber: number,
): string {
  const suffix = hasMultipleTypes && detectedName !== "Single"
    ? ` ${detectedName}`
    : "";
  return `${year} ${examName}${suffix} Shift ${shiftNumber}`;
}

/**
 * Assigns session ("first",…,"Twentieth",…), shift ("Morning"/"Afternoon"),
 * a per-year sequential shift number, and formatted display_name.
 *
 * Rules:
 *  - Group by year, then by exam-date within year.
 *  - Same date = shifts of that date (max 2 per session).
 *  - 3+ on same date → split into multiple sessions of 2 each.
 *  - 1 on a date → only "Morning" shift.
 *  - No date → assigned sequentially, 2 per session.
 *  - Shift number is sequential within each year (1, 2, 3, …).
 */
export function assignSessionsAndShifts(
  papers: PaperInput[],
  examName: string,
  detectedName: string,
  hasMultipleTypes: boolean,
): AssignedPaper[] {
  const byYear = new Map<number, PaperInput[]>();
  for (const p of papers) {
    const list = byYear.get(p.year);
    if (list) list.push(p);
    else byYear.set(p.year, [p]);
  }

  const result: AssignedPaper[] = [];
  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);

  for (const year of sortedYears) {
    const yearPapers = byYear.get(year)!;
    const byDate = new Map<string, PaperInput[]>();
    const noDatePapers: PaperInput[] = [];

    for (const p of yearPapers) {
      if (p.examDate) {
        const dateKey = p.examDate.slice(0, 10);
        const list = byDate.get(dateKey);
        if (list) list.push(p);
        else byDate.set(dateKey, [p]);
      } else {
        noDatePapers.push(p);
      }
    }

    const sortedDates = [...byDate.keys()].sort();
    let sessionNum = 0;
    let shiftNum = 0;

    for (const dateKey of sortedDates) {
      const datePapers = byDate.get(dateKey)!;
      datePapers.sort((a, b) => a.displayName.localeCompare(b.displayName));

      for (let i = 0; i < datePapers.length; i += 2) {
        sessionNum++;
        const sess = sessionOrdinal(sessionNum);
        shiftNum++;
        const dur = datePapers[i].durationMinutes;

        result.push({
          paperId: datePapers[i].id,
          year,
          session: sess,
          shift: "Morning",
          shiftNumber: shiftNum,
          durationMinutes: dur,
          displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
        });

        if (i + 1 < datePapers.length) {
          shiftNum++;
          result.push({
            paperId: datePapers[i + 1].id,
            year,
            session: sess,
            shift: "Afternoon",
            shiftNumber: shiftNum,
            durationMinutes: datePapers[i + 1].durationMinutes,
            displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
          });
        }
      }
    }

    if (noDatePapers.length > 0) {
      noDatePapers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      for (let i = 0; i < noDatePapers.length; i += 2) {
        sessionNum++;
        const sess = sessionOrdinal(sessionNum);
        shiftNum++;
        const dur = noDatePapers[i].durationMinutes;

        result.push({
          paperId: noDatePapers[i].id,
          year,
          session: sess,
          shift: "Morning",
          shiftNumber: shiftNum,
          durationMinutes: dur,
          displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
        });

        if (i + 1 < noDatePapers.length) {
          shiftNum++;
          result.push({
            paperId: noDatePapers[i + 1].id,
            year,
            session: sess,
            shift: "Afternoon",
            shiftNumber: shiftNum,
            durationMinutes: noDatePapers[i + 1].durationMinutes,
            displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
          });
        }
      }
    }
  }

  return result;
}
