import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin("content.moderate");
    const { id } = await params;
    const { action, reason } = (await request.json()) as { action: "remove" | "restrict" | "shadow_ban" | "feature" | "promote"; reason?: string };

    if (!action) return NextResponse.json({ error: "Action required" }, { status: 400 });
    const ref = adminDb.collection("reels").doc(id);
    if (action === "remove") {
      await ref.set({ status: "removed", moderation: { status: "blocked", checkedAt: new Date().toISOString() } }, { merge: true });
    }
    if (action === "restrict") {
      await ref.set({ status: "restricted", moderation: { status: "review", checkedAt: new Date().toISOString() } }, { merge: true });
    }
    if (action === "shadow_ban") {
      await ref.set({ shadowBanned: true, moderation: { status: "blocked", checkedAt: new Date().toISOString() } }, { merge: true });
    }
    if (action === "feature") await ref.set({ featured: true, moderation: { status: "clear" } }, { merge: true });
    if (action === "promote") await ref.set({ promoted: true, moderation: { status: "clear" } }, { merge: true });

    await logAdminAction({ actorUid: actor.uid, actorRole: actor.role, action: `content.${action}`, targetType: "content", targetId: id, payload: { reason } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
