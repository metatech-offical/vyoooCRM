import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";
import {
  executeContentModerationAction,
  type ContentCollection,
  type ContentModerationAction,
} from "@/lib/moderation";

const VALID_COLLECTIONS: ContentCollection[] = ["reels", "stories"];
const VALID_ACTIONS: ContentModerationAction[] = ["hide", "restore"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ collection: string; id: string }> }
) {
  try {
    const actor = await requireAdmin("moderation.manage");
    const { collection, id } = await params;
    const { action, reason } = (await request.json()) as {
      action: ContentModerationAction;
      reason?: string;
    };

    if (!VALID_COLLECTIONS.includes(collection as ContentCollection)) {
      return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
    }
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await executeContentModerationAction({
      collection: collection as ContentCollection,
      contentId: id,
      action,
      actorUid: actor.uid,
      actorRole: actor.role,
      reason,
    });

    await logAdminAction({
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `moderation.content.${action}`,
      targetType: "content",
      targetId: `${collection}/${id}`,
      payload: { reason },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_NOT_FOUND") {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }
    return apiError(error);
  }
}
