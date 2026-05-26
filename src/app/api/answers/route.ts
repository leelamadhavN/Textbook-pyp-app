import { NextRequest, NextResponse } from "next/server";
import { getQuestionAnswersRaw, getServerAuthCode, parseJwtInfo } from "@/lib/testbook-api";
import { mapAnswerLookup } from "@/lib/testbook-mappers";

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
    return NextResponse.json(
      { success: false, message: "Auth token is expired. Please refresh it in the Auth Token panel." },
      { status: 401 },
    );
  }

  const result = await getQuestionAnswersRaw(paperId, authCode);

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
