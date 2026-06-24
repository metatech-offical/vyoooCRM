import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { AdminRole } from "@/lib/rbac";

export type ModerationQueueType =
  | "user_reports"
  | "reel_reports"
  | "story_reports"
  | "comment_reports"
  | "content"
  | "disputes";

export type UserModerationAction = "ban" | "suspend" | "restrict";
export type ContentModerationAction = "hide" | "restore";
export type ContentCollection = "reels" | "stories";

export function asDateString(value: unknown): string | null {
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

export function normalizeForJson(value: unknown): unknown {
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

export async function logModerationAction(input: {
  actorUid: string;
  actorRole: AdminRole;
  action: string;
  targetType: "user" | "content" | "dispute" | "report";
  targetId: string;
  payload?: Record<string, unknown>;
}) {
  await adminDb.collection("moderation_actions").add({
    ...input,
    createdAt: new Date().toISOString(),
  });
}

export async function executeUserModerationAction(input: {
  uid: string;
  action: UserModerationAction;
  actorUid: string;
  actorRole: AdminRole;
  reasonCode?: string;
  notes?: string;
}) {
  const { uid, action, actorUid, actorRole, reasonCode, notes } = input;
  const ref = adminDb.collection("users").doc(uid);

  if (action === "ban") {
    await adminAuth.updateUser(uid, { disabled: true });
    await ref.set(
      { verificationStatus: "banned", status: "banned", bannedAt: new Date().toISOString(), bannedBy: actorUid },
      { merge: true }
    );
  }
  if (action === "suspend") {
    await ref.set(
      { verificationStatus: "suspended", status: "suspended", suspendedAt: new Date().toISOString(), suspendedBy: actorUid },
      { merge: true }
    );
  }
  if (action === "restrict") {
    await ref.set({ accountType: "restricted", restrictedAt: new Date().toISOString(), restrictedBy: actorUid }, { merge: true });
  }

  await logModerationAction({
    actorUid,
    actorRole,
    action: `user.${action}`,
    targetType: "user",
    targetId: uid,
    payload: { reasonCode, notes },
  });
}

export async function executeContentModerationAction(input: {
  collection: ContentCollection;
  contentId: string;
  action: ContentModerationAction;
  actorUid: string;
  actorRole: AdminRole;
  reason?: string;
}) {
  const { collection, contentId, action, actorUid, actorRole, reason } = input;
  const ref = adminDb.collection(collection).doc(contentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("CONTENT_NOT_FOUND");

  const data = snap.data() ?? {};
  const moderation = (data.moderation as Record<string, unknown> | undefined) ?? {};
  const now = new Date().toISOString();

  if (action === "hide") {
    await ref.set(
      {
        moderation: {
          ...moderation,
          status: "blocked",
          blockedAt: now,
          blockedBy: actorUid,
          blockReason: reason ?? "manual_review",
        },
      },
      { merge: true }
    );
  }

  if (action === "restore") {
    await ref.set(
      {
        moderation: {
          ...moderation,
          status: "clear",
          restoredAt: now,
          restoredBy: actorUid,
          disputeStatus: null,
        },
        reportCount: 0,
      },
      { merge: true }
    );
  }

  await logModerationAction({
    actorUid,
    actorRole,
    action: `content.${action}`,
    targetType: "content",
    targetId: `${collection}/${contentId}`,
    payload: { collection, reason },
  });
}

export async function resolveModerationDispute(input: {
  disputeId: string;
  approve: boolean;
  actorUid: string;
  actorRole: AdminRole;
  staffNote?: string;
}) {
  const { disputeId, approve, actorUid, actorRole, staffNote } = input;
  const disputeRef = adminDb.collection("moderation_disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();
  if (!disputeSnap.exists) throw new Error("DISPUTE_NOT_FOUND");

  const dispute = disputeSnap.data() ?? {};
  const contentId = String(dispute.contentId ?? "");
  const contentCol = String(dispute.contentCollection ?? "");
  if (!contentId || (contentCol !== "reels" && contentCol !== "stories")) {
    throw new Error("INVALID_DISPUTE");
  }

  const contentRef = adminDb.collection(contentCol).doc(contentId);
  const contentSnap = await contentRef.get();
  if (!contentSnap.exists) throw new Error("CONTENT_NOT_FOUND");

  const moderation = (contentSnap.data()?.moderation as Record<string, unknown> | undefined) ?? {};
  const now = new Date().toISOString();
  const batch = adminDb.batch();

  batch.update(disputeRef, {
    status: approve ? "approved" : "rejected",
    resolvedBy: actorUid,
    staffNote: staffNote ?? "",
    updatedAt: now,
    resolvedAt: now,
  });

  if (approve) {
    batch.set(
      contentRef,
      {
        moderation: {
          ...moderation,
          status: "clear",
          disputeStatus: "approved",
          restoredAt: now,
          restoredBy: actorUid,
        },
        reportCount: 0,
      },
      { merge: true }
    );
  } else {
    batch.set(
      contentRef,
      {
        moderation: {
          ...moderation,
          disputeStatus: "rejected",
          disputeRejectedAt: now,
          disputeRejectedBy: actorUid,
        },
      },
      { merge: true }
    );
  }

  await batch.commit();

  await logModerationAction({
    actorUid,
    actorRole,
    action: approve ? "dispute.approved" : "dispute.rejected",
    targetType: "dispute",
    targetId: disputeId,
    payload: { contentId, contentCollection: contentCol, staffNote },
  });
}

async function fetchCollectionOrdered(
  collection: string,
  orderField = "createdAt",
  limit = 100
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  try {
    const snap = await adminDb.collection(collection).orderBy(orderField, "desc").limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: normalizeForJson(doc.data()) as Record<string, unknown> }));
  } catch {
    const snap = await adminDb.collection(collection).limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: normalizeForJson(doc.data()) as Record<string, unknown> }));
  }
}

async function fetchContentByModerationStatus(collection: ContentCollection, status: string, limit = 50) {
  try {
    const snap = await adminDb
      .collection(collection)
      .where("moderation.status", "==", status)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((doc) => mapContentItem(collection, doc.id, doc.data()));
  } catch {
    const snap = await adminDb.collection(collection).where("moderation.status", "==", status).limit(limit).get();
    return snap.docs.map((doc) => mapContentItem(collection, doc.id, doc.data()));
  }
}

function mapContentItem(collection: ContentCollection, id: string, raw: Record<string, unknown>) {
  const d = normalizeForJson(raw) as Record<string, unknown>;
  const moderation = (d.moderation as Record<string, unknown> | undefined) ?? {};
  return {
    id,
    collection,
    userId: String(d.userId ?? ""),
    username: String(d.username ?? ""),
    caption: String(d.caption ?? ""),
    mediaUrl: String(d.videoUrl ?? d.imageUrl ?? d.mediaUrl ?? d.thumbnailUrl ?? ""),
    thumbnailUrl: String(d.thumbnailUrl ?? d.imageUrl ?? ""),
    reportCount: Number(d.reportCount ?? 0),
    views: Number(d.viewsCount ?? d.views ?? d.viewCount ?? 0),
    createdAt: asDateString(d.createdAt),
    moderation: {
      status: String(moderation.status ?? ""),
      provider: String(moderation.provider ?? ""),
      reasons: Array.isArray(moderation.reasons) ? moderation.reasons : [],
      disputeStatus: moderation.disputeStatus ?? null,
      removedReason: moderation.removedReason ?? null,
    },
  };
}

function mapReportItem(
  id: string,
  data: Record<string, unknown>,
  kind: ModerationQueueType
) {
  return {
    id,
    kind,
    reporterId: String(data.reporterId ?? ""),
    reason: String(data.reason ?? ""),
    createdAt: asDateString(data.createdAt),
    reportedUserId: kind === "user_reports" ? String(data.reportedUserId ?? "") : undefined,
    reelId: kind === "reel_reports" ? String(data.reelId ?? "") : undefined,
    reelOwnerId: kind === "reel_reports" ? String(data.reelOwnerId ?? "") : undefined,
    storyId: kind === "story_reports" ? String(data.storyId ?? "") : undefined,
    storyOwnerId: kind === "story_reports" ? String(data.storyOwnerId ?? "") : undefined,
    commentId: kind === "comment_reports" ? String(data.commentId ?? "") : undefined,
    commentAuthorId: kind === "comment_reports" ? String(data.commentAuthorId ?? "") : undefined,
    reelIdForComment: kind === "comment_reports" ? String(data.reelId ?? "") : undefined,
  };
}

export async function fetchModerationQueue(type: ModerationQueueType, limit = 100) {
  if (type === "user_reports") {
    const items = await fetchCollectionOrdered("user_reports", "createdAt", limit);
    return items.map((item) => mapReportItem(item.id, item.data, type));
  }

  if (type === "reel_reports") {
    const items = await fetchCollectionOrdered("reel_reports", "createdAt", limit);
    return items.map((item) => mapReportItem(item.id, item.data, type));
  }

  if (type === "story_reports") {
    const items = await fetchCollectionOrdered("story_reports", "createdAt", limit);
    return items.map((item) => mapReportItem(item.id, item.data, type));
  }

  if (type === "comment_reports") {
    const items = await fetchCollectionOrdered("comment_reports", "createdAt", limit);
    return items.map((item) => mapReportItem(item.id, item.data, type));
  }

  if (type === "content") {
    const perStatus = Math.ceil(limit / 4);
    const [reelsReview, reelsCovered, storiesReview, storiesCovered] = await Promise.all([
      fetchContentByModerationStatus("reels", "review", perStatus),
      fetchContentByModerationStatus("reels", "report_covered", perStatus),
      fetchContentByModerationStatus("stories", "review", perStatus),
      fetchContentByModerationStatus("stories", "report_covered", perStatus),
    ]);
    return [...reelsReview, ...reelsCovered, ...storiesReview, ...storiesCovered].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  if (type === "disputes") {
    try {
      const snap = await adminDb
        .collection("moderation_disputes")
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((doc) => {
        const d = normalizeForJson(doc.data()) as Record<string, unknown>;
        return {
          id: doc.id,
          contentId: String(d.contentId ?? ""),
          contentCollection: String(d.contentCollection ?? ""),
          contentType: String(d.contentType ?? ""),
          ownerId: String(d.ownerId ?? ""),
          status: String(d.status ?? ""),
          createdAt: asDateString(d.createdAt),
        };
      });
    } catch {
      const snap = await adminDb.collection("moderation_disputes").where("status", "==", "pending").limit(limit).get();
      return snap.docs.map((doc) => {
        const d = normalizeForJson(doc.data()) as Record<string, unknown>;
        return {
          id: doc.id,
          contentId: String(d.contentId ?? ""),
          contentCollection: String(d.contentCollection ?? ""),
          contentType: String(d.contentType ?? ""),
          ownerId: String(d.ownerId ?? ""),
          status: String(d.status ?? ""),
          createdAt: asDateString(d.createdAt),
        };
      });
    }
  }

  return [];
}

export async function fetchModerationQueueCounts() {
  const [userReports, reelReports, storyReports, commentReports, disputes] = await Promise.all([
    adminDb.collection("user_reports").count().get().catch(() => null),
    adminDb.collection("reel_reports").count().get().catch(() => null),
    adminDb.collection("story_reports").count().get().catch(() => null),
    adminDb.collection("comment_reports").count().get().catch(() => null),
    adminDb.collection("moderation_disputes").where("status", "==", "pending").count().get().catch(() => null),
  ]);

  const contentItems = await fetchModerationQueue("content", 200);

  return {
    user_reports: Number(userReports?.data().count ?? 0),
    reel_reports: Number(reelReports?.data().count ?? 0),
    story_reports: Number(storyReports?.data().count ?? 0),
    comment_reports: Number(commentReports?.data().count ?? 0),
    content: contentItems.length,
    disputes: Number(disputes?.data().count ?? 0),
  };
}
