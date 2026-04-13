import { NextRequest, NextResponse } from "next/server";
import { getRolesRaw } from "@/lib/testbook-api";
import { mapRoles } from "@/lib/testbook-mappers";

const CIVILS_SUPER_GROUP_ID = "5f8e7cdd8b924a652e9217e6";
const STATE_GOVT_SUPER_GROUP_ID = "5e6189e15f66e94f14a21f95";

function mergeUniqueRoles(
  baseRoles: ReturnType<typeof mapRoles>,
  extraRoles: ReturnType<typeof mapRoles>,
) {
  const byId = new Map(baseRoles.map((role) => [role.id, role]));
  const byTitle = new Set(baseRoles.map((role) => role.title.trim().toLowerCase()));

  for (const role of extraRoles) {
    const normalizedTitle = role.title.trim().toLowerCase();
    if (!role.id || !role.title) continue;
    if (byId.has(role.id) || byTitle.has(normalizedTitle)) continue;

    byId.set(role.id, role);
    byTitle.add(normalizedTitle);
  }

  return [...byId.values()];
}

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

  let items = mapRoles(result.body as Record<string, unknown>);

  if (categoryId === CIVILS_SUPER_GROUP_ID) {
    const stateGovtResult = await getRolesRaw(STATE_GOVT_SUPER_GROUP_ID);

    if (stateGovtResult.success) {
      const appscSupplementRoles = mapRoles(stateGovtResult.body as Record<string, unknown>).filter(
        (role) => /^appsc group [234]\b/i.test(role.title.trim()),
      );

      items = mergeUniqueRoles(items, appscSupplementRoles);
    }
  }

  return NextResponse.json({
    success: true,
    items,
    raw: result.body,
  });
}
