import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

type VerificationStatus = "pending" | "submitted" | "in_review" | "verified" | "rejected";

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin("verification.read");
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") ?? "all").toLowerCase();
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

    const snap = await adminDb
      .collection("verification_requests")
      .orderBy("submittedAt", "desc")
      .limit(limit)
      .get();

    const items = snap.docs
      .map((doc) => {
        const d = doc.data();
        const currentStatus = String(d.status ?? "pending").toLowerCase() as VerificationStatus;
        return {
          id: doc.id,
          uid: String(d.uid ?? ""),
          email: String(d.email ?? ""),
          fullName: String(d.fullName ?? ""),
          country: String(d.country ?? ""),
          idType: String(d.idType ?? ""),
          notes: String(d.notes ?? ""),
          pdfUrl: String(d.pdfUrl ?? ""),
          pdfFileName: String(d.pdfFileName ?? ""),
          status: currentStatus,
          submittedAt: normalizeTimestamp(d.submittedAt),
          reviewedAt: normalizeTimestamp(d.reviewedAt),
          reviewedBy: d.reviewedBy ? String(d.reviewedBy) : null,
          reviewNote: d.reviewNote ? String(d.reviewNote) : null,
        };
      })
      .filter((item) => {
        const statusMatch = status === "all" || item.status === status;
        if (!statusMatch) return false;
        if (!q) return true;
        return [item.email, item.fullName, item.uid, item.country, item.idType, item.id]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });

    return NextResponse.json({ requests: items });
  } catch (error) {
    return apiError(error);
  }
}
