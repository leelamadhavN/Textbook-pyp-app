import { NextRequest, NextResponse } from "next/server";
import { getRolesRaw } from "@/lib/testbook-api";
import { mapRoles } from "@/lib/testbook-mappers";

export async function GET(request: NextRequest) {
  const categoryId = request.nextUrl.searchParams.get("categoryId");

  if (!categoryId) {
    return NextResponse.json(
      { success: false, message: "categoryId is required" },
      { status: 400 },
    );
  }

  const result = await getRolesRaw(categoryId);

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch roles",
        details: result.body,
      },
      { status: result.status || 500 },
    );
  }

  return NextResponse.json({
    success: true,
    items: mapRoles(result.body as Record<string, unknown>),
    raw: result.body,
  });
}
