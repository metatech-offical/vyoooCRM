import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

function normalizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeForJson);

  if (typeof value === "object") {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === "function") {
      try {
        return withToDate.toDate().toISOString();
      } catch {
        return String(value);
      }
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeForJson(v);
    }
    return out;
  }

  return value;
}

export async function GET(request: Request) {
  try {
    await requireAdmin("users.read");
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const statusFilter = url.searchParams.get("status")?.trim().toLowerCase() ?? "all";
    const cursor = url.searchParams.get("cursor") ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);

    let query = adminDb.collection("users").orderBy("createdAt", "desc").limit(limit + 1);
    if (cursor) {
      const cursorDoc = await adminDb.collection("users").doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const docs = snap.docs.slice(0, limit);

    const users = docs.map((doc) => {
      const d = normalizeForJson(doc.data()) as Record<string, unknown>;
      const status = d.disabled
        ? "banned"
        : d.suspended || d.status === "suspended"
          ? "suspended"
          : d.status ?? "active";

      const reportsCount = Number(d.reportsCount ?? d.reportCount ?? 0);
      const followersCount = Number(d.followersCount ?? 0);
      const blockedUsersCount = Array.isArray(d.blockedUsers) ? d.blockedUsers.length : 0;
      const restricted = Boolean(d.restricted ?? false);
      const riskScore = Math.min(
        100,
        Math.round(reportsCount * 12 + blockedUsersCount * 6 + (restricted ? 20 : 0) + (followersCount < 5 ? 8 : 0))
      );

      return {
        uid: doc.id,
        email: typeof d.email === "string" ? d.email : undefined,
        username:
          typeof d.username === "string"
            ? d.username
            : typeof d.displayName === "string"
              ? d.displayName
              : undefined,
        walletId:
          typeof d.walletId === "string"
            ? d.walletId
            : typeof d.walletAddress === "string"
              ? d.walletAddress
              : undefined,
        status,
        verificationStatus:
          typeof d.verificationStatus === "string"
            ? d.verificationStatus
            : d.isVerified === true
              ? "verified"
              : "none",
        isVerified: Boolean(d.isVerified ?? false),
        reportsCount,
        riskScore,
        details: {
          ...d,
          uid: doc.id,
        },
      };
    });

    const filtered = users.filter((user) => {
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return [user.uid, user.email ?? "", user.username ?? "", user.walletId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return NextResponse.json({
      users: filtered,
      pageInfo: {
        nextCursor: snap.docs.length > limit ? docs[docs.length - 1]?.id ?? null : null,
        hasMore: snap.docs.length > limit,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
