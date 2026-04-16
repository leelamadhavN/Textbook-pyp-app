import { NextRequest, NextResponse } from "next/server";
import { getQuestionAnswersRaw, getQuestionPaperRaw } from "@/lib/testbook-api";
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

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
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
    "topic",
    "topic_subject",
    "topic_category",
    "topic_type",
    "difficulty",
    "marks",
    "negative_marks",
  ];

  const lines: string[] = [headers.map(csvEscape).join(",")];

  for (const row of rows) {
    const values = [
      row.question_number,
      row.question_text,
      row.option_a,
      row.option_b,
      row.option_c,
      row.option_d,
      row.correct_option,
      row.solution_text,
      row.topic,
      row.topic_subject,
      row.topic_category,
      row.topic_type,
      row.difficulty,
      row.marks,
      row.negative_marks,
    ];

    lines.push(values.map(csvEscape).join(","));
  }

  // BOM + sep line improves CSV delimiter detection in Excel on Windows locales.
  return `\uFEFFsep=,\r\n${lines.join("\r\n")}`;
}

export async function GET(request: NextRequest) {
  const paperId = request.nextUrl.searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json(
      { success: false, message: "paperId is required" },
      { status: 400 },
    );
  }

  const result = await getQuestionPaperRaw(paperId);

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
  const answersResult = await getQuestionAnswersRaw(paperId);
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
