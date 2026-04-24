import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireAdmin("users.read");
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "all";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

    let query = adminDb.collection("admin_cases").orderBy("updatedAt", "desc").limit(limit);
    if (status !== "all") {
      query = query.where("status", "==", status);
    }

    const snap = await query.get();
    const cases = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
    return NextResponse.json({ cases });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin("users.moderate");
    const body = (await request.json()) as {
      subjectType: "user" | "content";
      subjectId: string;
      reasonCode?: string;
      notes?: string;
      priority?: "low" | "medium" | "high";
    };

    if (!body.subjectId || !body.subjectType) {
      return NextResponse.json({ error: "subjectType and subjectId are required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const ref = await adminDb.collection("admin_cases").add({
      status: "open",
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      reasonCode: body.reasonCode ?? "unspecified",
      notes: body.notes ?? "",
      priority: body.priority ?? "medium",
      ownerUid: admin.uid,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    return apiError(error);
  }
}
