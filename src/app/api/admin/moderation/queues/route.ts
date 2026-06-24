import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/http";
import {
  fetchModerationQueue,
  fetchModerationQueueCounts,
  type ModerationQueueType,
} from "@/lib/moderation";

const VALID_TYPES: ModerationQueueType[] = [
  "user_reports",
  "reel_reports",
  "story_reports",
  "comment_reports",
  "content",
  "disputes",
];

export async function GET(request: Request) {
  try {
    await requireAdmin("moderation.read");
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") ?? "user_reports") as ModerationQueueType;
    const includeCounts = url.searchParams.get("counts") === "true";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid queue type" }, { status: 400 });
    }

    const [items, counts] = await Promise.all([
      fetchModerationQueue(type, limit),
      includeCounts ? fetchModerationQueueCounts() : Promise.resolve(null),
    ]);

    return NextResponse.json({ type, items, counts });
  } catch (error) {
    return apiError(error);
  }
}
