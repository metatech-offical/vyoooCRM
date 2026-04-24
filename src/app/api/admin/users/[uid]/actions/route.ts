import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const actor = await requireAdmin("users.moderate");
    const { uid } = await params;
    const { action, reasonCode, notes, createCase } = (await request.json()) as {
      action: "ban" | "suspend" | "restrict" | "force_logout" | "verify_creator" | "verify_user";
      reasonCode?: string;
      notes?: string;
      createCase?: boolean;
    };

    if (!action) return NextResponse.json({ error: "Action required" }, { status: 400 });
    if (action === "ban") {
      await adminAuth.updateUser(uid, { disabled: true });
      await adminDb.collection("users").doc(uid).set({ status: "banned" }, { merge: true });
    }
    if (action === "suspend") await adminDb.collection("users").doc(uid).set({ status: "suspended" }, { merge: true });
    if (action === "restrict") await adminDb.collection("users").doc(uid).set({ restricted: true }, { merge: true });
    if (action === "force_logout") await adminAuth.revokeRefreshTokens(uid);
    if (action === "verify_creator") await adminDb.collection("users").doc(uid).set({ creatorVerified: true }, { merge: true });
    if (action === "verify_user") {
      await adminDb.collection("users").doc(uid).set(
        {
          isVerified: true,
          verificationStatus: "verified",
          verifiedAt: new Date().toISOString(),
          verificationSource: "crm_manual",
        },
        { merge: true }
      );
    }

    await logAdminAction({
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `users.${action}`,
      targetType: "user",
      targetId: uid,
      payload: { reasonCode, notes },
    });

    let caseId: string | null = null;
    if (createCase) {
      const caseRef = await adminDb.collection("admin_cases").add({
        status: "open",
        priority: action === "ban" ? "high" : "medium",
        subjectType: "user",
        subjectId: uid,
        action,
        reasonCode: reasonCode ?? "unspecified",
        notes: notes ?? "",
        ownerUid: actor.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      caseId = caseRef.id;
    }

    return NextResponse.json({ ok: true, caseId });
  } catch (error) {
    return apiError(error);
  }
}
