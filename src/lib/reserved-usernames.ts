import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

export type ReservedUsernameRecord = {
  id: string;
  username: string;
  category?: string;
  active: boolean;
  source?: string;
  assignedTo?: string;
  assignedAt?: string;
  assignedBy?: string;
  updatedAt?: string;
};

export function normalizeUsername(input: string): string {
  return input.trim().replace(/\s/g, "");
}

export function isValidUsernameFormat(username: string): boolean {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return false;
  if (!USERNAME_PATTERN.test(username)) return false;
  if (username.startsWith(".") || username.endsWith(".")) return false;
  if (username.includes("..")) return false;
  return true;
}

export function normalizeTimestamp(value: unknown): string | null {
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

function mapReservedDoc(id: string, data: Record<string, unknown>): ReservedUsernameRecord {
  const active = data.active;
  return {
    id,
    username: typeof data.username === "string" ? data.username : id,
    category: typeof data.category === "string" ? data.category : undefined,
    active: typeof active === "boolean" ? active : true,
    source: typeof data.source === "string" ? data.source : undefined,
    assignedTo: typeof data.assignedTo === "string" ? data.assignedTo : undefined,
    assignedAt: normalizeTimestamp(data.assignedAt) ?? undefined,
    assignedBy: typeof data.assignedBy === "string" ? data.assignedBy : undefined,
    updatedAt: normalizeTimestamp(data.updatedAt) ?? undefined,
  };
}

export async function getReservedUsername(username: string): Promise<ReservedUsernameRecord | null> {
  const key = normalizeUsername(username).toLowerCase();
  if (!key) return null;
  const snap = await adminDb.collection("reserved_usernames").doc(key).get();
  if (!snap.exists) return null;
  return mapReservedDoc(snap.id, snap.data() ?? {});
}

export async function listReservedUsernames(input: {
  q?: string;
  cursor?: string;
  limit?: number;
  activeOnly?: boolean;
}): Promise<{ items: ReservedUsernameRecord[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const q = (input.q ?? "").trim().toLowerCase();
  const activeOnly = input.activeOnly ?? false;

  let query = adminDb.collection("reserved_usernames").orderBy(FieldPath.documentId());

  if (q) {
    query = query
      .where(FieldPath.documentId(), ">=", q)
      .where(FieldPath.documentId(), "<=", `${q}\uf8ff`);
  }

  if (input.cursor) {
    query = query.startAfter(input.cursor);
  }

  const snap = await query.limit(limit + 1).get();
  const docs = snap.docs;
  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;

  let items = pageDocs.map((doc) => mapReservedDoc(doc.id, doc.data()));
  if (activeOnly) {
    items = items.filter((item) => item.active);
  }

  return {
    items,
    nextCursor: hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function readUsernamePolicy(): Promise<{ minLength: number; maxLength: number }> {
  try {
    const snap = await adminDb.collection("app_config").doc("username_policy").get();
    const min = snap.data()?.minLength;
    const max = snap.data()?.maxLength;
    return {
      minLength:
        typeof min === "number" && Number.isFinite(min) && min >= 1 && min <= 30 ? Math.floor(min) : USERNAME_MIN_LENGTH,
      maxLength:
        typeof max === "number" && Number.isFinite(max) && max >= 1 && max <= 30 ? Math.floor(max) : USERNAME_MAX_LENGTH,
    };
  } catch {
    return { minLength: USERNAME_MIN_LENGTH, maxLength: USERNAME_MAX_LENGTH };
  }
}

export async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  const normalized = normalizeUsername(username);
  const snap = await adminDb.collection("users").where("username", "==", normalized).limit(25).get();
  return snap.docs.some((doc) => {
    const data = doc.data();
    const docUid = typeof data.uid === "string" ? data.uid : doc.id;
    return docUid !== excludeUid;
  });
}

export async function assignReservedUsername(input: {
  uid: string;
  username: string;
  actorUid: string;
  notes?: string;
}): Promise<{ previousUsername?: string; username: string }> {
  const normalized = normalizeUsername(input.username);
  const key = normalized.toLowerCase();

  if (!isValidUsernameFormat(normalized)) {
    throw new Error(`Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and use letters, numbers, underscore, or dot.`);
  }

  const reservedRef = adminDb.collection("reserved_usernames").doc(key);
  const reservedSnap = await reservedRef.get();
  if (!reservedSnap.exists) {
    throw new Error("Username is not in the reserved list.");
  }

  const reserved = mapReservedDoc(reservedSnap.id, reservedSnap.data() ?? {});
  if (!reserved.active) {
    throw new Error("This reserved username has already been assigned or deactivated.");
  }

  const userRef = adminDb.collection("users").doc(input.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error("User not found.");
  }

  const previousUsername =
    typeof userSnap.data()?.username === "string" ? userSnap.data()?.username : undefined;

  if (await isUsernameTaken(normalized, input.uid)) {
    throw new Error("Another account already uses this username.");
  }

  const now = new Date().toISOString();
  await userRef.set(
    {
      username: normalized,
      reservedUsernameAssignedAt: now,
      reservedUsernameAssignedBy: input.actorUid,
      reservedUsernameClaimNotes: input.notes ?? "",
    },
    { merge: true }
  );

  await reservedRef.set(
    {
      active: false,
      assignedTo: input.uid,
      assignedAt: now,
      assignedBy: input.actorUid,
      assignmentNotes: input.notes ?? "",
      updatedAt: now,
    },
    { merge: true }
  );

  return { previousUsername, username: normalized };
}
