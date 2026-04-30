import type { DocumentReference, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const QUERY_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 400;

type DeleteByIdTarget = {
  collection: string;
  type: "docId";
};

type DeleteByFieldsTarget = {
  collection: string;
  type: "fields";
  fields: string[];
};

type DeleteCaseSubjectTarget = {
  collection: "admin_cases";
  type: "userSubject";
};

type DeletionTarget = DeleteByIdTarget | DeleteByFieldsTarget | DeleteCaseSubjectTarget;

type CascadeDeleteParams = {
  uid: string;
  dryRun?: boolean;
};

export type CascadeDeleteSummary = {
  dryRun: boolean;
  authUserFound: boolean;
  authUserDeleted: boolean;
  totalDocsDeleted: number;
  collectionCounts: Record<string, number>;
};

const DELETION_TARGETS: DeletionTarget[] = [
  { collection: "users", type: "docId" },
  { collection: "profiles", type: "docId" },
  { collection: "userSettings", type: "docId" },
  { collection: "verification_requests", type: "fields", fields: ["uid", "userId"] },
  { collection: "reels", type: "fields", fields: ["uid", "userId", "ownerUid", "authorUid", "createdBy"] },
  { collection: "comments", type: "fields", fields: ["uid", "userId", "authorUid", "ownerUid", "createdBy"] },
  { collection: "commentReports", type: "fields", fields: ["uid", "userId", "reporterUid", "reportedUid"] },
  { collection: "userLikes", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "likes", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "follows", type: "fields", fields: ["uid", "userId", "followerUid", "followedUid", "sourceUid", "targetUid"] },
  { collection: "followers", type: "fields", fields: ["uid", "userId", "followerUid", "followedUid"] },
  { collection: "following", type: "fields", fields: ["uid", "userId", "followerUid", "followedUid"] },
  { collection: "blocks", type: "fields", fields: ["uid", "userId", "blockerUid", "blockedUid", "sourceUid", "targetUid"] },
  { collection: "reports", type: "fields", fields: ["uid", "userId", "reporterUid", "reportedUid", "subjectUid"] },
  { collection: "content_reports", type: "fields", fields: ["uid", "userId", "reporterUid", "reportedUid", "subjectUid"] },
  { collection: "notifications", type: "fields", fields: ["uid", "userId", "recipientUid", "senderUid", "actorUid", "targetUid"] },
  { collection: "userNotifications", type: "fields", fields: ["uid", "userId", "recipientUid", "senderUid", "actorUid", "targetUid"] },
  { collection: "chatThreads", type: "fields", fields: ["uid", "userId", "createdBy", "ownerUid"] },
  { collection: "chats", type: "fields", fields: ["uid", "userId", "createdBy", "ownerUid", "senderUid", "recipientUid"] },
  { collection: "messages", type: "fields", fields: ["uid", "userId", "createdBy", "ownerUid", "senderUid", "recipientUid"] },
  { collection: "messageThreads", type: "fields", fields: ["uid", "userId", "createdBy", "ownerUid"] },
  { collection: "bookmarks", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "saved_items", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "sessions", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "devices", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "pushTokens", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "userPushTokens", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "storage_assets", type: "fields", fields: ["uid", "userId", "ownerUid", "uploadedBy"] },
  { collection: "uploads", type: "fields", fields: ["uid", "userId", "ownerUid", "uploadedBy"] },
  { collection: "payouts", type: "fields", fields: ["uid", "userId", "ownerUid"] },
  { collection: "transactions", type: "fields", fields: ["uid", "userId", "ownerUid", "counterpartyUid"] },
  { collection: "admin_cases", type: "userSubject" },
];

async function collectQueryRefs(query: Query): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = [];
  let cursor: QueryDocumentSnapshot | null = null;

  while (true) {
    let pageQuery = query.limit(QUERY_BATCH_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);

    const snap = await pageQuery.get();
    if (snap.empty) break;

    refs.push(...snap.docs.map((doc) => doc.ref));
    cursor = snap.docs[snap.docs.length - 1] ?? null;

    if (snap.size < QUERY_BATCH_SIZE) break;
  }

  return refs;
}

async function collectTargetRefs(uid: string, target: DeletionTarget): Promise<Map<string, DocumentReference>> {
  const refs = new Map<string, DocumentReference>();

  if (target.type === "docId") {
    const docRef = adminDb.collection(target.collection).doc(uid);
    const snap = await docRef.get();
    if (snap.exists) refs.set(docRef.path, docRef);
    return refs;
  }

  if (target.type === "userSubject") {
    const matched = await collectQueryRefs(
      adminDb.collection(target.collection).where("subjectType", "==", "user").where("subjectId", "==", uid)
    );
    for (const ref of matched) refs.set(ref.path, ref);
    return refs;
  }

  for (const field of target.fields) {
    const matched = await collectQueryRefs(adminDb.collection(target.collection).where(field, "==", uid));
    for (const ref of matched) refs.set(ref.path, ref);
  }

  return refs;
}

async function deleteRefs(refs: DocumentReference[]): Promise<number> {
  let deleted = 0;
  for (let idx = 0; idx < refs.length; idx += DELETE_BATCH_SIZE) {
    const chunk = refs.slice(idx, idx + DELETE_BATCH_SIZE);
    const batch = adminDb.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

export async function cascadeDeleteUserData({ uid, dryRun = false }: CascadeDeleteParams): Promise<CascadeDeleteSummary> {
  const collectionCounts: Record<string, number> = {};
  let totalDocsDeleted = 0;

  let authUserFound = false;
  try {
    await adminAuth.getUser(uid);
    authUserFound = true;
  } catch {
    authUserFound = false;
  }

  for (const target of DELETION_TARGETS) {
    const refs = await collectTargetRefs(uid, target);
    const refsList = [...refs.values()];
    collectionCounts[target.collection] = refsList.length;
    if (!dryRun && refsList.length > 0) {
      totalDocsDeleted += await deleteRefs(refsList);
    }
  }

  let authUserDeleted = false;
  if (!dryRun && authUserFound) {
    await adminAuth.deleteUser(uid);
    authUserDeleted = true;
  }

  return {
    dryRun,
    authUserFound,
    authUserDeleted,
    totalDocsDeleted,
    collectionCounts,
  };
}
