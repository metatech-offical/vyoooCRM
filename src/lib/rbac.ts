export type AdminRole = "admin" | "moderator" | "support";

const rolePermissions: Record<AdminRole, string[]> = {
  admin: ["analytics.read", "users.read", "users.moderate", "reserved_usernames.read", "reserved_usernames.manage", "content.read", "content.moderate", "moderation.read", "moderation.manage", "system.read", "audit.read", "verification.read", "verification.manage"],
  moderator: ["analytics.read", "users.read", "users.moderate", "reserved_usernames.read", "reserved_usernames.manage", "content.read", "content.moderate", "moderation.read", "moderation.manage", "system.read", "verification.read", "verification.manage"],
  support: ["analytics.read", "users.read", "reserved_usernames.read", "content.read", "moderation.read"],
};

export function hasPermission(role: AdminRole, permission: string): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}
