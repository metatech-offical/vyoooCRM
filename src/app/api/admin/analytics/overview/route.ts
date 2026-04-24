import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET() {
  try {
    await requireAdmin("analytics.read");
    const [usersSnap, reelsSnap, likesSnap] = await Promise.all([
      adminDb.collection("users").limit(500).get(),
      adminDb.collection("reels").limit(500).get(),
      adminDb.collection("userLikes").limit(500).get(),
    ]);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const dau = usersSnap.docs.filter((doc) => {
      const d = doc.data();
      const dt = asDate(d.lastSeenAt ?? d.lastActiveAt ?? d.updatedAt ?? d.createdAt);
      return dt ? now - dt.getTime() <= dayMs : false;
    }).length;

    const mau = usersSnap.docs.filter((doc) => {
      const d = doc.data();
      const dt = asDate(d.lastSeenAt ?? d.lastActiveAt ?? d.updatedAt ?? d.createdAt);
      return dt ? now - dt.getTime() <= 30 * dayMs : false;
    }).length;

    const liveStreams = reelsSnap.docs.filter((doc) => {
      const d = doc.data();
      return d.isLive === true || d.mediaType === "live";
    }).length;

    const totalViews = reelsSnap.docs.reduce((sum, doc) => {
      const d = doc.data();
      return sum + Number(d.viewsCount ?? d.views ?? 0);
    }, 0);

    const totalComments = reelsSnap.docs.reduce((sum, doc) => {
      const d = doc.data();
      return sum + Number(d.commentsCount ?? d.comments ?? 0);
    }, 0);

    const totalLikes = likesSnap.size;

    const avgViewsPerReel = reelsSnap.size > 0 ? Math.round(totalViews / reelsSnap.size) : 0;
    const engagementRate =
      totalViews > 0 ? (((totalLikes + totalComments) / totalViews) * 100).toFixed(1) : "0.0";

    const publishedReels = reelsSnap.docs.filter((doc) => {
      const d = doc.data();
      return d.status !== "removed" && d.moderation?.status !== "removed";
    }).length;

    return NextResponse.json({
      kpis: [
        { label: "DAU", value: String(dau), trend: "from users activity" },
        { label: "MAU", value: String(mau), trend: "last 30 days" },
        { label: "Total Users", value: String(usersSnap.size) },
        { label: "Published Reels", value: String(publishedReels) },
        { label: "Live Streams", value: String(liveStreams) },
        { label: "Total Views", value: String(totalViews) },
        { label: "Total Likes", value: String(totalLikes) },
        { label: "Engagement", value: `${engagementRate}%`, trend: `${avgViewsPerReel} avg views/reel` },
      ],
    });
  } catch (error) {
    return apiError(error);
  }
}
