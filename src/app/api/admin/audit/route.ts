import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    await requireAdmin("audit.read");
    const snap = await adminDb.collection("admin_audit_logs").orderBy("createdAt", "desc").limit(100).get();
    const logs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ logs });
  } catch (error) {
    return apiError(error);
  }
}
