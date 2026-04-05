import { NextResponse } from "next/server";
import { getSuperGroupsRaw } from "@/lib/testbook-api";
import { mapSuperGroups } from "@/lib/testbook-mappers";

export async function GET() {
  const result = await getSuperGroupsRaw();

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch super groups",
        details: result.body,
      },
      { status: result.status || 500 },
    );
  }

  return NextResponse.json({
    success: true,
    items: mapSuperGroups(result.body as Record<string, unknown>),
    raw: result.body,
  });
}
