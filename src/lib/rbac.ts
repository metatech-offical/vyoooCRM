export type AdminRole = "admin" | "moderator" | "support";

const rolePermissions: Record<AdminRole, string[]> = {
  admin: ["analytics.read", "users.read", "users.moderate", "content.read", "content.moderate", "system.read", "audit.read", "verification.read", "verification.manage"],
  moderator: ["analytics.read", "users.read", "users.moderate", "content.read", "content.moderate", "system.read", "verification.read", "verification.manage"],
  support: ["analytics.read", "users.read", "content.read"],
};

export function hasPermission(role: AdminRole, permission: string): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}
