import { NextRequest, NextResponse } from "next/server";
import { getQuestionAnswersRaw } from "@/lib/testbook-api";
import { mapAnswerLookup } from "@/lib/testbook-mappers";

export async function GET(request: NextRequest) {
  const paperId = request.nextUrl.searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json(
      { success: false, message: "paperId is required" },
      { status: 400 },
    );
  }

  const result = await getQuestionAnswersRaw(paperId);

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch question answers",
        details: result.body,
      },
      { status: result.status || 500 },
    );
  }

  return NextResponse.json({
    success: true,
    items: mapAnswerLookup(result.body as Record<string, unknown>),
    raw: result.body,
  });
}
