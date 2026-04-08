import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
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

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      "question_number",
      "question_text",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_option",
      "solution_text",
      "difficulty",
      "marks",
      "negative_marks",
    ],
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");

  const infoSheet = XLSX.utils.json_to_sheet([
    { key: "paper_id", value: paperId },
    { key: "answers_available", value: answersAvailable ? "true" : "false" },
    { key: "answers_message", value: answersMessage },
  ]);
  XLSX.utils.book_append_sheet(workbook, infoSheet, "Info");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  const nameFromApi = getPaperTitle(payload);
  const safeName = sanitizeFileName(nameFromApi || "question-paper");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      "Cache-Control": "no-store",
      "X-Answers-Available": answersAvailable ? "true" : "false",
      "X-Answers-Message": encodeURIComponent(answersMessage),
    },
  });
}
