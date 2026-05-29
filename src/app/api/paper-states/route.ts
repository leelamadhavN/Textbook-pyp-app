import { NextRequest, NextResponse } from "next/server";
import { getServerAuthCode, parseJwtInfo } from "@/lib/testbook-api";

export type PaperStateInfo = {
  accessible: boolean;
  attemptsCompleted: number;
  isAnalysisGenerated: boolean;
};

const BATCH = 10;

async function checkOneState(paperId: string, authCode: string): Promise<PaperStateInfo> {
  try {
    const url = new URL(`https://api-new.testbook.com/api/v2/tests/${encodeURIComponent(paperId)}/state`);
    url.searchParams.set("auth_code", authCode);
    url.searchParams.set("X-Tb-Client", "web,1.3");
    url.searchParams.set("language", "English");
    url.searchParams.set("client", "web");
    url.searchParams.set("testLang", "en");
    url.searchParams.set("beforeServe", "true");
    url.searchParams.set("random", String(Math.random()));

    const r = await fetch(url.toString(), { cache: "no-store" });

    if (!r.ok) {
      return { accessible: false, attemptsCompleted: 0, isAnalysisGenerated: false };
    }

    const body = (await r.json()) as Record<string, unknown>;
    const d = (body.data ?? {}) as Record<string, unknown>;

    return {
      accessible: true,
      attemptsCompleted: typeof d.attemptsCompleted === "number" ? d.attemptsCompleted : 0,
      isAnalysisGenerated: Boolean(d.isAnalysisGenerated),
    };
  } catch {
    return { accessible: false, attemptsCompleted: 0, isAnalysisGenerated: false };
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("paperIds") ?? "";
  const paperIds = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);

  if (paperIds.length === 0) {
    return NextResponse.json({ success: false, message: "paperIds is required" }, { status: 400 });
  }

  const authCode = getServerAuthCode(request.headers.get("x-auth-token"));
  const jwtInfo = parseJwtInfo(authCode);
  if (jwtInfo.isExpired) {
    return NextResponse.json(
      { success: false, message: "Auth token expired. Please refresh it in the Auth Token panel." },
      { status: 401 },
    );
  }

  const states: Record<string, PaperStateInfo> = {};

  for (let i = 0; i < paperIds.length; i += BATCH) {
    const batch = paperIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((id) => checkOneState(id, authCode)));
    batch.forEach((id, idx) => {
      states[id] = results[idx];
    });
  }

  return NextResponse.json({ success: true, states });
}
