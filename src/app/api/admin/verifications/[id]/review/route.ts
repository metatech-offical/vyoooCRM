import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";

type ReviewAction = "in_review" | "approved" | "rejected";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin("verification.manage");
    const { id } = await params;
    const body = (await request.json()) as {
      action: ReviewAction;
      reviewNote?: string;
    };

    if (!body.action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    if (body.action === "rejected" && !body.reviewNote?.trim()) {
      return NextResponse.json(
        { error: "reviewNote is required for rejected requests" },
        { status: 400 }
      );
    }

    const reqRef = adminDb.collection("verification_requests").doc(id);
    const reqDoc = await reqRef.get();

    if (!reqDoc.exists) {
      return NextResponse.json({ error: "request not found" }, { status: 404 });
    }

    const reqData = reqDoc.data() as Record<string, unknown>;
    const uid = String(reqData.uid ?? "");
    const now = new Date().toISOString();

    if (body.action === "in_review") {
      await reqRef.set(
        {
          status: "in_review",
          reviewedAt: null,
          reviewedBy: admin.email ?? admin.uid,
          reviewNote: body.reviewNote?.trim() || null,
        },
        { merge: true }
      );
    }

    if (body.action === "approved") {
      await reqRef.set(
        {
          status: "verified",
          reviewedAt: now,
          reviewedBy: admin.email ?? admin.uid,
          reviewNote: body.reviewNote?.trim() || null,
        },
        { merge: true }
      );

      if (uid) {
        await adminDb.collection("users").doc(uid).set(
          {
            isVerified: true,
            verificationStatus: "verified",
          },
          { merge: true }
        );
      }
    }

    if (body.action === "rejected") {
      await reqRef.set(
        {
          status: "rejected",
          reviewedAt: now,
          reviewedBy: admin.email ?? admin.uid,
          reviewNote: body.reviewNote?.trim() || null,
        },
        { merge: true }
      );

      if (uid) {
        await adminDb.collection("users").doc(uid).set(
          {
            isVerified: false,
            verificationStatus: "rejected",
          },
          { merge: true }
        );
      }
    }

    await logAdminAction({
      actorUid: admin.uid,
      actorRole: admin.role,
      action: `verification.${body.action}`,
      targetType: "user",
      targetId: uid || id,
      payload: {
        requestId: id,
        reviewNote: body.reviewNote?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
