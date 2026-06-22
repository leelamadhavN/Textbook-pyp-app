const EXAMPPREP_BASE_URL = "https://examprep-web-mu.vercel.app";
const EXAMPPREP_EMAIL = "sagar.butla@gmail.com";
const EXAMPPREP_PASSWORD = "12345678";

let authCookieHeader = "";
let authCookies: string[] = [];

async function examprepFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authCookieHeader) {
    headers["Cookie"] = authCookieHeader;
  }

  const url = `${EXAMPPREP_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { error: err instanceof Error ? err.message : "Upstream unreachable" },
    };
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
    data = text ? { error: text } : null;
  }

  return { ok: res.ok, status: res.status, data };
}

export async function loginExamprep(): Promise<boolean> {
  const { ok } = await examprepFetch("/api/auth", {
    action: "login",
    email: EXAMPPREP_EMAIL,
    password: EXAMPPREP_PASSWORD,
  });
  return ok;
}

async function ensureLogin(): Promise<void> {
  if (authCookieHeader) return;
  const ok = await loginExamprep();
  if (!ok) throw new Error("Failed to login to examprep");
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

export async function createExam(name: string): Promise<string> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-exam",
    name,
    category: "other",
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
): Promise<string> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-paper-type",
    exam_id: examId,
    name,
    stage,
    duration_minutes: 180,
    total_marks: 100,
    total_questions: 100,
    negative_marking: 0,
    display_order: 0,
  });
  if (!ok) throw new Error(`Failed to create paper type: ${JSON.stringify(data)}`);
  return ((data as Record<string, unknown>)?.paper_type as Record<string, unknown>)?.id as string;
}

export async function listPaperInstances(
  paperTypeId: string,
): Promise<Array<{ id: string; year: number; display_name: string }>> {
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
        display_name: pi.display_name as string,
      }),
    ) ?? []
  );
}

export async function createPaperInstance(
  paperTypeId: string,
  year: number,
  displayName: string,
): Promise<string> {
  await ensureLogin();
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-paper-instance",
    paper_type_id: paperTypeId,
    year,
    display_name: displayName,
  });
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
    return { stage: `tier${num}`, name: `Tier ${num}` };
  }

  if (t.match(/\bprelims\b|\bpreliminary\b|pre\s*\.?\s*exam\b/i)) {
    const pn = extractPaperNum(t);
    const name = pn ? `Prelims Paper ${romanLabels[pn]}` : "Prelims";
    return { stage: "prelims", name };
  }

  if (t.match(/\bmains\b|\bmain\s*exam\b/i)) {
    const pn = extractPaperNum(t);
    const name = pn ? `Mains Paper ${romanLabels[pn]}` : "Mains";
    return { stage: "mains", name };
  }

  const paperMatch = t.match(/paper\s*[-\s]?\s*(?:([1-4])|(i|ii|iii|iv))\b/i);
  if (paperMatch) {
    const num = paperMatch[1]
      ? parseInt(paperMatch[1])
      : romanMap[paperMatch[2].toLowerCase()] ?? 1;
    return { stage: "single", name: `Paper ${romanLabels[num]}` };
  }

  const stageMatch = t.match(/stage\s*[-\s]?\s*([1-4])\b/i);
  if (stageMatch) {
    return { stage: "single", name: `Stage ${stageMatch[1]}` };
  }

  return { stage: "single", name: "Single" };
}
