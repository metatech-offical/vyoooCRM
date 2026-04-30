import { NextResponse } from "next/server";
import type { DocumentReference, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";
import { logAdminAction } from "@/lib/audit";

type ModerationAction =
  | "remove"
  | "restrict"
  | "shadow_ban"
  | "feature"
  | "promote"
  | "delete_permanently";

const QUERY_BATCH_SIZE = 300;
const QUERY_CONCURRENCY = 6;

function extractStorageObjectPath(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const parsed = new URL(input);
    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const start = parsed.pathname.indexOf(marker);
      if (start === -1) return null;
      const encodedPath = parsed.pathname.slice(start + marker.length);
      return decodeURIComponent(encodedPath);
    }
    if (parsed.hostname.endsWith("storage.googleapis.com")) {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts.length <= 1) return null;
      return decodeURIComponent(pathParts.slice(1).join("/"));
    }
  } catch {
    return null;
  }
  return null;
}

async function deleteStorageFiles(possibleUrls: unknown[]) {
  if (!adminStorage) return 0;
  const objectPaths = new Set<string>();
  for (const url of possibleUrls) {
    const parsedPath = extractStorageObjectPath(url);
    if (parsedPath) objectPaths.add(parsedPath);
  }

  let deleted = 0;
  for (const objectPath of objectPaths) {
    try {
      await adminStorage.bucket().file(objectPath).delete({ ignoreNotFound: true });
      deleted += 1;
    } catch {
      // Skip any malformed or stale file references.
    }
  }
  return deleted;
}

async function countExistingStorageFiles(objectPaths: string[]) {
  if (!adminStorage) return 0;
  const storage = adminStorage;
  const checks = await mapWithConcurrency<string, number>(objectPaths, QUERY_CONCURRENCY, async (objectPath) => {
    try {
      const [exists] = await storage.bucket().file(objectPath).exists();
      return exists ? 1 : 0;
    } catch {
      return 0;
    }
  });
  return checks.reduce((sum, value) => sum + value, 0);
}

function collectStorageObjectPaths(possibleUrls: unknown[]): Set<string> {
  const objectPaths = new Set<string>();
  for (const url of possibleUrls) {
    const parsedPath = extractStorageObjectPath(url);
    if (parsedPath) objectPaths.add(parsedPath);
  }
  return objectPaths;
}

async function countDocsByField(collectionName: string, fieldName: string, reelId: string) {
  const baseQuery = adminDb.collection(collectionName).where(fieldName, "==", reelId);
  try {
    const aggregate = await baseQuery.count().get();
    return Number(aggregate.data().count ?? 0);
  } catch {
    // Fallback for environments where aggregate queries are unavailable.
  }

  let count = 0;
  let cursor: QueryDocumentSnapshot | null = null;

  while (true) {
    let query = baseQuery.limit(QUERY_BATCH_SIZE);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;
    count += snap.size;
    cursor = snap.docs[snap.docs.length - 1] ?? null;

    if (snap.size < QUERY_BATCH_SIZE) break;
  }

  return count;
}

async function collectDocRefsByField(collectionName: string, fieldName: string, reelId: string) {
  const refs = new Map<string, DocumentReference>();
  let cursor: QueryDocumentSnapshot | null = null;
  while (true) {
    let query = adminDb.collection(collectionName).where(fieldName, "==", reelId).limit(QUERY_BATCH_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) refs.set(doc.ref.path, doc.ref);
    cursor = snap.docs[snap.docs.length - 1] ?? null;
    if (snap.size < QUERY_BATCH_SIZE) break;
  }
  return refs;
}

async function deleteDocRefs(refs: DocumentReference[]) {
  let deleted = 0;
  for (let idx = 0; idx < refs.length; idx += QUERY_BATCH_SIZE) {
    const chunk = refs.slice(idx, idx + QUERY_BATCH_SIZE);
    const batch = adminDb.batch();
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

async function cascadeDeleteReel(reelId: string, previewOnly = false) {
  const reelRef = adminDb.collection("reels").doc(reelId);
  const reelSnap = await reelRef.get();
  const reelData = reelSnap.exists ? reelSnap.data() ?? {} : {};

  const collectionFieldPairs: Array<{ collection: string; field: string }> = [
    { collection: "comments", field: "reelId" },
    { collection: "comments", field: "contentId" },
    { collection: "comments", field: "postId" },
    { collection: "reel_comments", field: "reelId" },
    { collection: "likes", field: "reelId" },
    { collection: "likes", field: "contentId" },
    { collection: "userLikes", field: "reelId" },
    { collection: "userLikes", field: "contentId" },
    { collection: "reel_likes", field: "reelId" },
    { collection: "reports", field: "reelId" },
    { collection: "reports", field: "contentId" },
    { collection: "content_reports", field: "reelId" },
    { collection: "content_reports", field: "contentId" },
    { collection: "reel_reports", field: "reelId" },
    { collection: "bookmarks", field: "reelId" },
    { collection: "saved_items", field: "reelId" },
    { collection: "saves", field: "reelId" },
    { collection: "shares", field: "reelId" },
    { collection: "notifications", field: "reelId" },
    { collection: "userNotifications", field: "reelId" },
    { collection: "views", field: "reelId" },
    { collection: "reel_views", field: "reelId" },
    { collection: "content_views", field: "reelId" },
  ];

  const relatedBreakdown: Record<string, number> = {};
  const uniqueRefs = new Map<string, DocumentReference>();
  let relatedMatched = 0;
  if (previewOnly) {
    const counts = await mapWithConcurrency(collectionFieldPairs, QUERY_CONCURRENCY, async (pair) => {
      const key = `${pair.collection}.${pair.field}`;
      const matched = await countDocsByField(pair.collection, pair.field, reelId);
      return { key, matched };
    });
    for (const item of counts) {
      relatedBreakdown[item.key] = item.matched;
      relatedMatched += item.matched;
    }
  } else {
    const refsByPair = await mapWithConcurrency(collectionFieldPairs, QUERY_CONCURRENCY, async (pair) => {
      const key = `${pair.collection}.${pair.field}`;
      const refs = await collectDocRefsByField(pair.collection, pair.field, reelId);
      return { key, refs };
    });
    for (const item of refsByPair) {
      relatedBreakdown[item.key] = item.refs.size;
      relatedMatched += item.refs.size;
      for (const [path, ref] of item.refs) uniqueRefs.set(path, ref);
    }
  }

  const storageObjectPaths = collectStorageObjectPaths([
    reelData.videoUrl,
    reelData.imageUrl,
    reelData.thumbnailUrl,
    reelData.mediaUrl,
    typeof reelData.moderation === "object" && reelData.moderation !== null ? (reelData.moderation as { mediaUrl?: unknown }).mediaUrl : null,
  ]);

  let relatedDeleted = 0;
  let fileDeleteCount = 0;
  let verification:
    | {
        cleanupComplete: boolean;
        reelDocExistsAfter: boolean;
        remainingRelated: number;
        remainingBreakdown: Record<string, number>;
        remainingStorageFiles: number;
      }
    | null = null;
  if (!previewOnly) {
    await adminDb.recursiveDelete(reelRef);
    relatedDeleted = await deleteDocRefs([...uniqueRefs.values()]);
    fileDeleteCount = await deleteStorageFiles([...storageObjectPaths]);

    const remainingBreakdown: Record<string, number> = {};
    const remainingCounts = await mapWithConcurrency(collectionFieldPairs, QUERY_CONCURRENCY, async (pair) => {
      const key = `${pair.collection}.${pair.field}`;
      const count = await countDocsByField(pair.collection, pair.field, reelId);
      return { key, count };
    });
    let remainingRelated = 0;
    for (const item of remainingCounts) {
      remainingBreakdown[item.key] = item.count;
      remainingRelated += item.count;
    }
    const remainingStorageFiles = await countExistingStorageFiles([...storageObjectPaths]);
    const reelDocExistsAfter = (await reelRef.get()).exists;
    verification = {
      cleanupComplete: !reelDocExistsAfter && remainingRelated === 0 && remainingStorageFiles === 0,
      reelDocExistsAfter,
      remainingRelated,
      remainingBreakdown,
      remainingStorageFiles,
    };
  }

  return {
    previewOnly,
    reelDocExists: reelSnap.exists,
    relatedMatched: previewOnly ? relatedMatched : relatedDeleted,
    relatedDeleted,
    relatedBreakdown,
    fileCandidates: storageObjectPaths.size,
    fileDeleteCount,
    verification,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin("content.moderate");
    const { id } = await params;
    const { action, reason, previewOnly } = (await request.json()) as { action: ModerationAction; reason?: string; previewOnly?: boolean };

    if (!action) return NextResponse.json({ error: "Action required" }, { status: 400 });
    const ref = adminDb.collection("reels").doc(id);
    if (action === "remove") {
      await ref.set({ status: "removed", moderation: { status: "blocked", checkedAt: new Date().toISOString() } }, { merge: true });
    }
    if (action === "restrict") {
      await ref.set({ status: "restricted", moderation: { status: "review", checkedAt: new Date().toISOString() } }, { merge: true });
    }
    if (action === "shadow_ban") {
      await ref.set({ shadowBanned: true, moderation: { status: "blocked", checkedAt: new Date().toISOString() } }, { merge: true });
    }
    if (action === "feature") await ref.set({ featured: true, moderation: { status: "clear" } }, { merge: true });
    if (action === "promote") await ref.set({ promoted: true, moderation: { status: "clear" } }, { merge: true });
    if (action === "delete_permanently") {
      const deleted = await cascadeDeleteReel(id, previewOnly === true);
      if (previewOnly === true) {
        return NextResponse.json({ ok: true, preview: true, ...deleted });
      }
      await logAdminAction({
        actorUid: actor.uid,
        actorRole: actor.role,
        action: "content.delete_permanently",
        targetType: "content",
        targetId: id,
        payload: { reason, ...deleted },
      });
      return NextResponse.json({ ok: true, ...deleted });
    }

    await logAdminAction({ actorUid: actor.uid, actorRole: actor.role, action: `content.${action}`, targetType: "content", targetId: id, payload: { reason } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
