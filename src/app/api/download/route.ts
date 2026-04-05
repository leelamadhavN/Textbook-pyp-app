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
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch question paper",
        details: result.body,
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
