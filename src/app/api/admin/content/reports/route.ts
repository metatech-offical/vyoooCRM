import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

type HiveStatus = "pending" | "clear" | "review" | "blocked" | "error" | "skipped" | "approved";

function toHiveStatus(input: unknown): HiveStatus {
  const raw = String(input ?? "").toLowerCase();
  if (
    raw === "pending" ||
    raw === "clear" ||
    raw === "review" ||
    raw === "blocked" ||
    raw === "error" ||
    raw === "skipped" ||
    raw === "approved"
  ) {
    return raw;
  }
  return "pending";
}

function asDateString(value: unknown): string | null {
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
    await requireAdmin("content.read");
    const url = new URL(request.url);
    const moderationFilter = (url.searchParams.get("status") ?? "all").toLowerCase();
    const visibilityFilter = (url.searchParams.get("visibility") ?? "all").toLowerCase();

    const snap = await adminDb.collection("reels").limit(50).get();
    const reports = snap.docs
      .map((doc) => {
      const d = doc.data();
      const moderation = d.moderation ?? {};
      const reportsCount =
        Number(d.reportsCount ?? moderation.reportsCount ?? moderation.flagCount ?? 0) || 0;
        const moderationStatus = toHiveStatus(moderation.status ?? d.status);
        const visibleInFeed = moderationStatus === "clear" || moderationStatus === "approved";

      return {
        id: doc.id,
        title: d.title ?? d.caption ?? "Untitled",
        type: d.mediaType ?? "reel",
        status: moderationStatus,
        reportsCount,
        username: d.username ?? "",
        userId: d.userId ?? "",
        mediaUrl: d.videoUrl || d.imageUrl || moderation.mediaUrl || d.thumbnailUrl || "",
        thumbnailUrl: d.thumbnailUrl || d.imageUrl || "",
        caption: d.caption ?? "",
        likes: Number(d.likes ?? 0),
        comments: Number(d.comments ?? 0),
        views: Number(d.viewsCount ?? d.views ?? 0),
        createdAt: asDateString(d.createdAt),
        moderation: {
          provider: moderation.provider ?? "hive",
          status: moderationStatus,
          score: Number(moderation.score ?? 0),
          reasons: Array.isArray(moderation.reasons) ? moderation.reasons : [],
          checkedAt: asDateString(moderation.checkedAt),
          mediaUrl: moderation.mediaUrl ?? null,
        },
        visibleInFeed,
      };
      })
      .filter((item) => {
        const moderationMatch = moderationFilter === "all" || item.status === moderationFilter;
        if (!moderationMatch) return false;
        if (visibilityFilter === "all") return true;
        if (visibilityFilter === "visible") return item.visibleInFeed;
        if (visibilityFilter === "hidden") return !item.visibleInFeed;
        return true;
      });
    return NextResponse.json({ reports });
  } catch (error) {
    return apiError(error);
  }
}
