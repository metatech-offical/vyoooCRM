import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";
import { executeUserModerationAction, type UserModerationAction } from "@/lib/moderation";

const VALID_ACTIONS: UserModerationAction[] = ["ban", "suspend", "restrict"];

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const actor = await requireAdmin("moderation.manage");
    const { uid } = await params;
    const { action, reasonCode, notes } = (await request.json()) as {
      action: UserModerationAction;
      reasonCode?: string;
      notes?: string;
    };

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await executeUserModerationAction({
      uid,
      action,
      actorUid: actor.uid,
      actorRole: actor.role,
      reasonCode,
      notes,
    });

    await logAdminAction({
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `moderation.user.${action}`,
      targetType: "user",
      targetId: uid,
      payload: { reasonCode, notes },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
