import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { getReservedUsername, listReservedUsernames, readUsernamePolicy } from "@/lib/reserved-usernames";

export async function GET(request: Request) {
  try {
    await requireAdmin("reserved_usernames.read");
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const cursor = (url.searchParams.get("cursor") ?? "").trim() || undefined;
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const activeOnly = url.searchParams.get("active") === "true";
    const exact = url.searchParams.get("exact") === "true";

    const policy = await readUsernamePolicy();

    if (exact && q) {
      const item = await getReservedUsername(q);
      return NextResponse.json({
        policy,
        items: item ? [item] : [],
        pageInfo: { nextCursor: null, hasMore: false },
      });
    }

    const result = await listReservedUsernames({ q: q || undefined, cursor, limit, activeOnly });
    return NextResponse.json({
      policy,
      items: result.items,
      pageInfo: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  } catch (error) {
    return apiError(error);
  }
}
