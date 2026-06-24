import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { apiError } from "@/lib/http";
import { assignReservedUsername } from "@/lib/reserved-usernames";

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin("reserved_usernames.manage");
    const body = (await request.json()) as { uid?: string; username?: string; notes?: string };

    const uid = (body.uid ?? "").trim();
    const username = (body.username ?? "").trim();
    const notes = (body.notes ?? "").trim();

    if (!uid) return NextResponse.json({ error: "User UID is required." }, { status: 400 });
    if (!username) return NextResponse.json({ error: "Reserved username is required." }, { status: 400 });

    let result: Awaited<ReturnType<typeof assignReservedUsername>>;
    try {
      result = await assignReservedUsername({
        uid,
        username,
        actorUid: actor.uid,
        notes: notes || undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Assignment failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await logAdminAction({
      actorUid: actor.uid,
      actorRole: actor.role,
      action: "reserved_usernames.assign",
      targetType: "user",
      targetId: uid,
      payload: { username: result.username, previousUsername: result.previousUsername, notes },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
