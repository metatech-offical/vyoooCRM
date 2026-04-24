import { adminDb } from "@/lib/firebase/admin";
import type { AdminRole } from "@/lib/rbac";

export async function logAdminAction(input: {
  actorUid: string;
  actorRole: AdminRole;
  action: string;
  targetType: "user" | "content" | "system" | "auth";
  targetId: string;
  payload?: Record<string, unknown>;
}) {
  await adminDb.collection("admin_audit_logs").add({ ...input, createdAt: new Date().toISOString() });
}
