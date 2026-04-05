import { NextRequest, NextResponse } from "next/server";
import { getPapersRaw } from "@/lib/testbook-api";
import { mapPapers } from "@/lib/testbook-mappers";

export async function GET(request: NextRequest) {
  const examId = request.nextUrl.searchParams.get("examId");
  const start = Number(request.nextUrl.searchParams.get("start") ?? "0");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "5");
  const year = request.nextUrl.searchParams.get("year") ?? "all";

  if (!examId) {
    return NextResponse.json(
      { success: false, message: "examId is required" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(start) || start < 0) {
    return NextResponse.json(
      { success: false, message: "start must be a non-negative number" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return NextResponse.json(
      { success: false, message: "limit must be a positive number" },
      { status: 400 },
    );
  }

  const result = await getPapersRaw(examId, {
    start,
    limit,
    year,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch papers",
        details: result.body,
      },
      { status: result.status || 500 },
    );
  }

  const rawBody = result.body as Record<string, unknown>;
  const rawData = (rawBody.data as Record<string, unknown>) ?? {};
  const yearFilters = Array.isArray(rawData.yearFilters)
    ? (rawData.yearFilters as Array<Record<string, unknown>>)
    : [];

  const yearCounts = yearFilters
    .map((item) => ({
      year: typeof item.year === "number" ? item.year : Number(item.year ?? 0),
      count: typeof item.count === "number" ? item.count : Number(item.count ?? 0),
    }))
    .filter((item) => item.year > 0 && item.count >= 0)
    .sort((a, b) => b.year - a.year);

  const totalOverall = yearCounts.reduce((sum, item) => sum + item.count, 0);
  const selectedYear = year !== "all" ? Number(year) : null;
  const totalForSelection =
    selectedYear && Number.isFinite(selectedYear)
      ? (yearCounts.find((item) => item.year === selectedYear)?.count ?? 0)
      : totalOverall;

  return NextResponse.json({
    success: true,
    items: mapPapers(rawBody),
    pagination: {
      start,
      limit,
      total: totalForSelection,
      totalOverall,
    },
    yearCounts,
    raw: rawBody,
  });
}
