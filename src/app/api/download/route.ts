import { NextRequest, NextResponse } from "next/server";
import { getQuestionAnswersRaw, getQuestionPaperRaw, getServerAuthCode, initTestAttempt, parseJwtInfo } from "@/lib/testbook-api";
import { rowsToCsv } from "@/lib/csv";
import { getPaperTitle, mapAnswerLookup, mapExportRows } from "@/lib/testbook-mappers";

function sanitizeFileName(name: string) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getErrorMessage(details: unknown): string {
  if (!details || typeof details !== "object") {
    return "Failed to fetch question paper";
  }

  const typed = details as Record<string, unknown>;
  if (typeof typed.message === "string" && typed.message.trim()) {
    return typed.message;
  }

  if (typeof typed.error === "string" && typed.error.trim()) {
    return typed.error;
  }

  return "Failed to fetch question paper";
}

function countQuestions(payload: Record<string, unknown>): number {
  const data = (payload.data as Record<string, unknown>) ?? {};
  const sections = Array.isArray(data.sections)
    ? (data.sections as Array<Record<string, unknown>>)
    : [];

  let count = 0;
  for (const section of sections) {
    const questions = Array.isArray(section.questions)
      ? (section.questions as Array<unknown>)
      : [];
    count += questions.length;
  }

  return count;
}

function toCsv(rows: ReturnType<typeof mapExportRows>): string {
  const headers = [
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

  return rowsToCsv(
    headers,
    rows.map((row) => [
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
}

export async function GET(request: NextRequest) {
  const paperId = request.nextUrl.searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json(
      { success: false, message: "paperId is required" },
      { status: 400 },
    );
  }

  const authCode = getServerAuthCode(request.headers.get("x-auth-token"));

  const jwtInfo = parseJwtInfo(authCode);
  if (jwtInfo.isExpired) {
    const expiredAt = jwtInfo.expiresAt ? new Date(jwtInfo.expiresAt).toLocaleString() : "unknown";
    return NextResponse.json(
      {
        success: false,
        message: `Auth token expired on ${expiredAt}. Please paste a fresh auth_code in the Auth Token panel — open testbook.com, DevTools → Network, filter "api-new.testbook.com", copy the "auth_code" query param.`,
      },
      { status: 401 },
    );
  }

  const result = await getQuestionPaperRaw(paperId, authCode);

  if (!result.success) {
    const details = result.body;
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(details),
        details,
      },
      { status: result.status || 500 },
    );
  }

  const payload = result.body as Record<string, unknown>;

  // Fetch answers; retry with initTestAttempt if answers are unavailable for any reason:
  //   - API returns 400 (paper not yet attempted) → success=false
  //   - API returns 200 but data is empty
  // Both cases require creating the attempt first.
  let answersResult = await getQuestionAnswersRaw(paperId, authCode);
  const answersData = answersResult.success
    ? ((answersResult.body as Record<string, unknown>)?.data as Record<string, unknown> | null)
    : null;
  const answersEmpty = !answersData || Object.keys(answersData).length === 0;
  if (answersEmpty) {
    await initTestAttempt(paperId, authCode);
    answersResult = await getQuestionAnswersRaw(paperId, authCode);
  }

  const answersAvailable = answersResult.success;
  const answersMessage = answersAvailable
    ? "Answers loaded"
    : getErrorMessage(answersResult.body);

  const answersLookup = answersResult.success
    ? mapAnswerLookup(answersResult.body as Record<string, unknown>)
    : {};

  const questionCount = countQuestions(payload);
  const answersCount = Object.keys(answersLookup).length;
  console.info(
    `[download] paperId=${paperId} questionCount=${questionCount} answersAvailable=${answersAvailable} answersCount=${answersCount} message=${answersMessage}`,
  );

  const rows = mapExportRows(payload, answersLookup);
  const csv = toCsv(rows);

  const nameFromApi = getPaperTitle(payload);
  const safeName = sanitizeFileName(nameFromApi || "question-paper");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      "Cache-Control": "no-store",
      "X-Answers-Available": answersAvailable ? "true" : "false",
      "X-Answers-Message": encodeURIComponent(answersMessage),
    },
  });
}
