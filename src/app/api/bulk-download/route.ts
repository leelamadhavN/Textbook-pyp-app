import { NextRequest, NextResponse } from "next/server";
import {
  getQuestionPaperRaw,
  getQuestionAnswersRaw,
  getPapersRaw,
  getServerAuthCode,
  initTestAttempt,
  parseJwtInfo,
} from "@/lib/testbook-api";
import { rowsToCsv } from "@/lib/csv";
import { mapPapers, mapExportRows, mapAnswerLookup } from "@/lib/testbook-mappers";
import type { Paper } from "@/lib/testbook-mappers";

const BATCH_SIZE = 3;
const MAX_PAPERS = 200;

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllPapers(examId: string, yearFilter: string): Promise<Paper[]> {
  const initResult = await getPapersRaw(examId, {
    start: 0,
    limit: 1,
    year: yearFilter !== "all" ? yearFilter : "",
  });
  if (!initResult.success) return [];

  const rawBody = initResult.body as Record<string, unknown>;
  const rawData = (rawBody.data as Record<string, unknown>) ?? {};
  const yearFilters = Array.isArray(rawData.yearFilters)
    ? (rawData.yearFilters as Array<{ year: number; count: number }>)
    : [];

  if (yearFilter !== "all") {
    const yearCount = yearFilters.find((y) => String(y.year) === yearFilter)?.count ?? 0;
    if (yearCount === 0) return [];
    const result = await getPapersRaw(examId, {
      start: 0,
      limit: Math.min(yearCount, MAX_PAPERS),
      year: yearFilter,
    });
    return result.success ? mapPapers(result.body as Record<string, unknown>) : [];
  }

  // All years: fetch each year in parallel
  const yearResults = await Promise.all(
    yearFilters.map((yf) =>
      getPapersRaw(examId, {
        start: 0,
        limit: Math.min(yf.count, 50),
        year: String(yf.year),
      }),
    ),
  );

  const seen = new Set<string>();
  const all = yearResults
    .filter((r) => r.success)
    .flatMap((r) => mapPapers(r.body as Record<string, unknown>))
    .filter((p) => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

  return all.slice(0, MAX_PAPERS);
}

type BulkRow = {
  paper_title: string;
  year: number;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  solution_text: string;
  topic_subject: string;
  topic_category: string;
  difficulty: string;
  marks: number | string;
  negative_marks: number | string;
};

export async function GET(request: NextRequest) {
  const examId = request.nextUrl.searchParams.get("examId");
  const yearFilter = request.nextUrl.searchParams.get("year") ?? "all";
  const examName = request.nextUrl.searchParams.get("examName") ?? "exam";

  if (!examId) {
    return NextResponse.json({ success: false, message: "examId is required" }, { status: 400 });
  }

  const authCode = getServerAuthCode(request.headers.get("x-auth-token"));
  const jwtInfo = parseJwtInfo(authCode);
  if (jwtInfo.isExpired) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Auth token expired. Please paste a fresh auth_code in the Auth Token panel.",
      },
      { status: 401 },
    );
  }

  const papers = await fetchAllPapers(examId, yearFilter);

  if (papers.length === 0) {
    return NextResponse.json(
      { success: false, message: "No papers found for this exam / year filter." },
      { status: 404 },
    );
  }

  const allRows: BulkRow[] = [];
  let papersProcessed = 0;
  let papersFailed = 0;
  let papersSkipped = 0;

  // Process in batches of BATCH_SIZE to avoid rate-limiting
  for (let i = 0; i < papers.length; i += BATCH_SIZE) {
    const batch = papers.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (paper) => {
        // Pre-check: is this paper accessible for the current account?
        const stateUrl = new URL(
          `https://api-new.testbook.com/api/v2/tests/${encodeURIComponent(paper.id)}/state`,
        );
        stateUrl.searchParams.set("auth_code", authCode);
        stateUrl.searchParams.set("X-Tb-Client", "web,1.3");
        stateUrl.searchParams.set("language", "English");
        stateUrl.searchParams.set("client", "web");
        stateUrl.searchParams.set("testLang", "en");
        stateUrl.searchParams.set("beforeServe", "true");
        stateUrl.searchParams.set("random", String(Math.random()));

        const stateResp = await fetch(stateUrl.toString(), { cache: "no-store" }).catch(() => null);
        if (!stateResp?.ok) {
          papersSkipped += 1;
          return;
        }

        // Initiate the attempt so the answers endpoint unlocks
        await initTestAttempt(paper.id, authCode);

        const [paperResult, firstAnswersResult] = await Promise.all([
          getQuestionPaperRaw(paper.id, authCode),
          getQuestionAnswersRaw(paper.id, authCode),
        ]);

        if (!paperResult.success) {
          papersFailed += 1;
          return;
        }

        // If answers still missing after initTestAttempt, retry once more
        const firstAnswersData = firstAnswersResult.success
          ? ((firstAnswersResult.body as Record<string, unknown>)?.data as Record<string, unknown> | null)
          : null;
        const answersResult =
          !firstAnswersData || Object.keys(firstAnswersData).length === 0
            ? await getQuestionAnswersRaw(paper.id, authCode)
            : firstAnswersResult;

        const paperPayload = paperResult.body as Record<string, unknown>;
        const answersLookup = answersResult.success
          ? mapAnswerLookup(answersResult.body as Record<string, unknown>)
          : {};

        const rows = mapExportRows(paperPayload, answersLookup);
        for (const row of rows) {
          allRows.push({ paper_title: paper.title, year: paper.year, ...row });
        }

        papersProcessed += 1;
      }),
    );
  }

  if (allRows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: `No questions could be extracted. ${papersFailed} papers failed.`,
      },
      { status: 500 },
    );
  }

  // Build CSV
  const headers = [
    "paper_title",
    "year",
    "question_number",
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_option",
    "solution_text",
    "subject",
    "chapter",
    "difficulty",
    "marks",
    "negative_marks",
  ];

  const csv = rowsToCsv(
    headers,
    allRows.map((row) => [
      row.paper_title,
      row.year,
      row.question_number,
      row.question_text,
      row.option_a,
      row.option_b,
      row.option_c,
      row.option_d,
      row.correct_option,
      row.solution_text,
      row.topic_subject,
      row.topic_category,
      row.difficulty,
      row.marks,
      row.negative_marks,
    ]),
  );
  const yearSuffix = yearFilter !== "all" ? `_${yearFilter}` : "_all_years";
  const safeName = sanitizeFileName(examName);
  const fileName = `${safeName}${yearSuffix}`;

  console.info(
    `[bulk-download] examId=${examId} year=${yearFilter} papers=${papers.length} processed=${papersProcessed} failed=${papersFailed} skipped=${papersSkipped} questions=${allRows.length}`,
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.csv"`,
      "Cache-Control": "no-store",
      "X-Papers-Total": String(papers.length),
      "X-Papers-Processed": String(papersProcessed),
      "X-Papers-Failed": String(papersFailed),
      "X-Papers-Skipped": String(papersSkipped),
      "X-Questions-Total": String(allRows.length),
    },
  });
}
