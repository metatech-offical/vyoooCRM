import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import type { AdminRole } from "@/lib/rbac";
import { hasPermission } from "@/lib/rbac";

export const SESSION_COOKIE_NAME = "vyooo_admin_session";

export async function getCurrentAdmin() {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const token = await adminAuth.verifySessionCookie(sessionCookie, true);
    const role = (token.role as AdminRole | undefined) ?? "support";
    return { uid: token.uid, email: token.email, role };
  } catch {
    return null;
  }
}

export async function requireAdmin(permission?: string) {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  if (permission && !hasPermission(admin.role, permission)) throw new Error("FORBIDDEN");
  return admin;
}
