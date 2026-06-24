import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";
import { resolveModerationDispute } from "@/lib/moderation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin("moderation.manage");
    const { id } = await params;
    const { approve, staffNote } = (await request.json()) as {
      approve: boolean;
      staffNote?: string;
    };

    if (typeof approve !== "boolean") {
      return NextResponse.json({ error: "approve (boolean) required" }, { status: 400 });
    }

    await resolveModerationDispute({
      disputeId: id,
      approve,
      actorUid: actor.uid,
      actorRole: actor.role,
      staffNote,
    });

    await logAdminAction({
      actorUid: actor.uid,
      actorRole: actor.role,
      action: approve ? "moderation.dispute.approved" : "moderation.dispute.rejected",
      targetType: "content",
      targetId: id,
      payload: { staffNote },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "DISPUTE_NOT_FOUND") {
        return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
      }
      if (error.message === "CONTENT_NOT_FOUND") {
        return NextResponse.json({ error: "Linked content not found" }, { status: 404 });
      }
      if (error.message === "INVALID_DISPUTE") {
        return NextResponse.json({ error: "Invalid dispute data" }, { status: 400 });
      }
    }
    return apiError(error);
  }
}
