import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getQuestionPaperRaw } from "@/lib/testbook-api";
import { getPaperTitle, mapExportRows } from "@/lib/testbook-mappers";

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
  const rows = mapExportRows(payload);

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
    },
  });
}
