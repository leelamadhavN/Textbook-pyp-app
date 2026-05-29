import { NextRequest, NextResponse } from "next/server";
import { getPapersRaw } from "@/lib/testbook-api";
import { mapPapers } from "@/lib/testbook-mappers";
import type { Paper } from "@/lib/testbook-mappers";

const MAX_PAPERS = 200;

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

  const yearResults = await Promise.all(
    yearFilters.map((yf) =>
      getPapersRaw(examId, {
        start: 0,
        limit: Math.min(yf.count, 50),
        year: String(yf.year),
      }),
    ),
  );

  const all = yearResults
    .filter((r) => r.success)
    .flatMap((r) => mapPapers(r.body as Record<string, unknown>));

  return all.slice(0, MAX_PAPERS);
}

export async function GET(request: NextRequest) {
  const examId = request.nextUrl.searchParams.get("examId");
  const yearFilter = request.nextUrl.searchParams.get("year") ?? "all";

  if (!examId) {
    return NextResponse.json({ success: false, message: "examId is required" }, { status: 400 });
  }

  const papers = await fetchAllPapers(examId, yearFilter);

  return NextResponse.json({ success: true, papers });
}
