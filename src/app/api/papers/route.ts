import { NextRequest, NextResponse } from "next/server";
import { getPapersRaw } from "@/lib/testbook-api";
import { mapPapers } from "@/lib/testbook-mappers";

type YearCount = {
  year: number;
  count: number;
};

function getYearCounts(rawData: Record<string, unknown>): YearCount[] {
  const yearFilters = Array.isArray(rawData.yearFilters)
    ? (rawData.yearFilters as Array<Record<string, unknown>>)
    : [];

  return yearFilters
    .map((item) => ({
      year: typeof item.year === "number" ? item.year : Number(item.year ?? 0),
      count: typeof item.count === "number" ? item.count : Number(item.count ?? 0),
    }))
    .filter((item) => item.year > 0 && item.count > 0)
    .sort((a, b) => b.year - a.year);
}

function getYearSegments(yearCounts: YearCount[], start: number, limit: number) {
  const segments: Array<{ year: number; start: number; limit: number }> = [];
  const requestedStart = start;
  const requestedEnd = start + limit;

  let cursor = 0;
  for (const item of yearCounts) {
    const yearStart = cursor;
    const yearEnd = yearStart + item.count;

    if (requestedEnd <= yearStart) break;

    if (requestedStart < yearEnd && requestedEnd > yearStart) {
      const segmentStart = Math.max(requestedStart, yearStart);
      const segmentEnd = Math.min(requestedEnd, yearEnd);

      segments.push({
        year: item.year,
        start: segmentStart - yearStart,
        limit: segmentEnd - segmentStart,
      });
    }

    cursor = yearEnd;
  }

  return segments.filter((segment) => segment.limit > 0);
}

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
    start: 0,
    limit: 1,
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
  const yearCounts = getYearCounts(rawData);

  const totalOverall = yearCounts.reduce((sum, item) => sum + item.count, 0);
  const selectedYear = year !== "all" ? Number(year) : null;
  const totalForSelection =
    selectedYear && Number.isFinite(selectedYear)
      ? (yearCounts.find((item) => item.year === selectedYear)?.count ?? 0)
      : totalOverall;

  let items = mapPapers(rawBody);

  if (year === "all") {
    const segments = getYearSegments(yearCounts, start, limit);

    if (segments.length > 0) {
      const pageResults = await Promise.all(
        segments.map((segment) =>
          getPapersRaw(examId, {
            start: segment.start,
            limit: segment.limit,
            year: String(segment.year),
          }),
        ),
      );

      items = pageResults
        .filter((pageResult) => pageResult.success)
        .flatMap((pageResult) => mapPapers(pageResult.body as Record<string, unknown>));
    } else {
      items = [];
    }
  } else {
    const pageResult = await getPapersRaw(examId, {
      start,
      limit,
      year,
    });

    if (!pageResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to fetch papers",
          details: pageResult.body,
        },
        { status: pageResult.status || 500 },
      );
    }

    items = mapPapers(pageResult.body as Record<string, unknown>);
  }

  return NextResponse.json({
    success: true,
    items,
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
