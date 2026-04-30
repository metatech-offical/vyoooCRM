"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ManagedUser = {
  uid: string;
  email?: string;
  username?: string;
  walletId?: string;
  status: string;
  verificationStatus?: string;
  isVerified?: boolean;
  reportsCount: number;
  riskScore?: number;
  details?: Record<string, unknown>;
};

type UsersResponse = {
  users: ManagedUser[];
  pageInfo?: { nextCursor?: string | null; hasMore?: boolean };
};

const ACTIONS = ["ban", "suspend", "restrict", "force_logout", "verify_creator", "verify_user", "delete_user"] as const;
type UserAction = (typeof ACTIONS)[number];

const ACTION_LABELS: Record<UserAction, string> = {
  ban: "Ban User",
  suspend: "Suspend User",
  restrict: "Restrict Features",
  force_logout: "Force Logout",
  verify_creator: "Verify Creator",
  verify_user: "Verify User (Manual)",
  delete_user: "Delete User + Related Data",
};

function pickNumber(details: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!details) return null;
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}

function pickText(details: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!details) return null;
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const [action, setAction] = useState<UserAction>("restrict");
  const [reasonCode, setReasonCode] = useState("policy_violation");
  const [notes, setNotes] = useState("");
  const [createCase, setCreateCase] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function loadUsers(cursor?: string, append = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "25");
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);

      const payload = (await res.json()) as UsersResponse;
      setUsers((prev) => (append ? [...prev, ...(payload.users ?? [])] : payload.users ?? []));
      setNextCursor(payload.pageInfo?.nextCursor ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedUser = useMemo(
    () => users.find((item) => item.uid === selectedUid) ?? null,
    [users, selectedUid]
  );

  const usersSorted = useMemo(
    () => [...users].sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0)),
    [users]
  );

  const selectedAnalytics = useMemo(() => {
    if (!selectedUser) return null;

    const details = selectedUser.details;
    return {
      followers: pickNumber(details, ["followersCount", "followers", "followerCount"]),
      following: pickNumber(details, ["followingCount", "following"]),
      posts: pickNumber(details, ["postsCount", "postCount", "reelsCount", "videosCount"]),
      likesReceived: pickNumber(details, ["likesCount", "likesReceived", "totalLikes"]),
      likesGiven: pickNumber(details, ["likesGiven", "givenLikesCount", "userLikesCount"]),
      comments: pickNumber(details, ["commentsCount", "commentCount"]),
      reports: pickNumber(details, ["reportsCount", "reportCount"]),
      warnings: pickNumber(details, ["warningsCount", "warningCount", "strikeCount"]),
      createdAt: pickText(details, ["createdAt", "created_at", "signupAt", "joinedAt"]),
      lastActiveAt: pickText(details, ["lastActiveAt", "last_seen_at", "updatedAt", "lastLoginAt"]),
      country: pickText(details, ["country", "countryCode"]),
      verificationMethod: pickText(details, ["verificationSource", "kycProvider", "verificationMethod"]),
      accountType: pickText(details, ["accountType", "userType", "role"]),
    };
  }, [selectedUser]);

  function userStatusVariant(status: string): "outline" | "secondary" | "destructive" {
    if (status === "banned") return "destructive";
    if (status === "suspended") return "secondary";
    return "outline";
  }

  function verificationVariant(status: string | undefined): "outline" | "secondary" | "destructive" {
    const s = (status ?? "none").toLowerCase();
    if (s === "verified") return "outline";
    if (s === "rejected") return "destructive";
    if (s === "pending" || s === "submitted" || s === "in_review") return "secondary";
    return "outline";
  }

  async function submitAction() {
    if (!selectedUser) return;
    setActionPending(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.uid}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reasonCode, notes, createCase }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        caseId?: string;
        error?: string;
        deletionSummary?: { totalDocsDeleted?: number; collectionCounts?: Record<string, number>; authUserDeleted?: boolean };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Action failed (${res.status})`);
      }
      if (data.caseId) {
        setHistory((h) => [`Case created: ${data.caseId}`, ...h]);
      }
      if (action === "delete_user" && data.deletionSummary) {
        const deletedDocs = data.deletionSummary.totalDocsDeleted ?? 0;
        const deletedAuth = data.deletionSummary.authUserDeleted ? "yes" : "no";
        const collectionInfo = Object.entries(data.deletionSummary.collectionCounts ?? {})
          .map(([name, count]) => `${name}:${count}`)
          .join(", ");
        setHistory((h) => [`Delete summary docs=${deletedDocs}, authDeleted=${deletedAuth}${collectionInfo ? ` (${collectionInfo})` : ""}`, ...h]);
      }
      setHistory((h) => [`Action applied: ${action} on ${selectedUser.uid}`, ...h]);
      setNotes("");
      setConfirmText("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply action");
    } finally {
      setActionPending(false);
    }
  }

  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">User Management</h2>
        <p className="crm-page-subtitle">
          Simple, operator-friendly CRM for searching users, understanding risk, and taking safe moderation actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find Users Quickly</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email, wallet, username, or UID"
          />
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
          <Button type="button" onClick={() => void loadUsers()}>
            Apply Filters
          </Button>
          <Button type="button" variant="outline" onClick={() => { setQuery(""); setStatusFilter("all"); void loadUsers(); }}>
            Reset
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Users List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Reports</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading users...</TableCell></TableRow>
              ) : null}
              {!loading && usersSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="size-8 text-muted-foreground/70" />
                      <p>No users found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              {usersSorted.map((u) => (
                <TableRow
                  key={u.uid}
                  className="cursor-pointer"
                  onClick={() => setSelectedUid((prev) => (prev === u.uid ? null : u.uid))}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedUid((prev) => (prev === u.uid ? null : u.uid));
                    }
                  }}
                >
                  <TableCell>
                    <p className="font-medium">{u.username ?? u.email ?? u.uid}</p>
                    <p className="text-xs text-muted-foreground">{u.email ?? "No email"}</p>
                  </TableCell>
                  <TableCell>{u.walletId ?? "-"}</TableCell>
                  <TableCell><Badge variant={userStatusVariant(u.status)}>{u.status}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={verificationVariant(u.verificationStatus)}>
                      {u.verificationStatus ?? "none"}
                    </Badge>
                  </TableCell>
                  <TableCell>{u.reportsCount}</TableCell>
                  <TableCell>
                    <Badge variant={Number(u.riskScore ?? 0) >= 60 ? "destructive" : "outline"}>
                      {u.riskScore ?? 0} / 100
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedUid === u.uid ? "default" : "outline"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUid((prev) => (prev === u.uid ? null : u.uid));
                      }}
                    >
                      {selectedUid === u.uid ? "Close" : "Open"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" disabled={!nextCursor || loading} onClick={() => {
              if (!nextCursor) return;
              setHistory((h) => [...h, nextCursor]);
              void loadUsers(nextCursor, true);
            }}>
              Load More
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedUser ? (
        <Card>
          <CardHeader>
            <CardTitle>Manage User: {selectedUser.username ?? selectedUser.email ?? selectedUser.uid}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review profile and risk first, then apply moderation actions with clear reason codes.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <p><span className="font-medium">UID:</span> {selectedUser.uid}</p>
              <p><span className="font-medium">Status:</span> {selectedUser.status}</p>
              <p><span className="font-medium">Risk Score:</span> {selectedUser.riskScore ?? 0}</p>
              <p><span className="font-medium">Reports:</span> {selectedUser.reportsCount}</p>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Suggested action</p>
              <p className="text-muted-foreground">
                {(selectedUser.riskScore ?? 0) >= 70
                  ? "High risk: consider suspend or ban after confirming evidence."
                  : (selectedUser.riskScore ?? 0) >= 40
                    ? "Medium risk: consider restrict and open a case for review."
                    : "Low risk: monitor and document notes before major action."}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Action</span>
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value as UserAction)}>
                  {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Reason Code</span>
                <Input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="policy_violation" />
              </label>
            </div>

            <label className="space-y-1 text-sm block">
              <span className="font-medium">Notes</span>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal moderation note"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createCase} onChange={(e) => setCreateCase(e.target.checked)} />
              Create case record for this action
            </label>

            <div className="flex gap-2">
              <Button type="button" disabled={actionPending} onClick={() => setConfirmOpen(true)}>
                {actionPending ? "Applying..." : "Apply Action"}
              </Button>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Technical data (for advanced debugging)</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify(selectedUser.details ?? {}, null, 2)}
              </pre>
            </details>

            {history.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium">Recent Activity</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {history.slice(0, 6).map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Confirm moderation action</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {action === "delete_user" ? (
                <>
                  This will permanently delete <strong>{selectedUser?.username ?? selectedUser?.email ?? selectedUser?.uid ?? "selected user"}</strong>,
                  their auth account, and related records from this admin app. This cannot be undone.
                </>
              ) : (
                <>
                  This will apply <strong>{ACTION_LABELS[action]}</strong> for{" "}
                  <strong>{selectedUser?.username ?? selectedUser?.email ?? selectedUser?.uid ?? "selected user"}</strong>.
                  This action will be logged in audit and may affect user access.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedUser && selectedAnalytics ? (
            <div className="max-h-[52vh] space-y-3 overflow-auto rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">User history and analytics snapshot</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">UID</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">{selectedUser.uid}</p>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="mt-1 break-all text-sm text-foreground">{selectedUser.email ?? "N/A"}</p>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Current status</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedUser.status}</p>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Verification</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedUser.verificationStatus ?? "none"}</p>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Risk score</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedUser.riskScore ?? 0} / 100</p>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Reports</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedAnalytics.reports ?? selectedUser.reportsCount}</p>
                </div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Followers</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.followers ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Following</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.following ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Posts/Reels</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.posts ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Comments</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.comments ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Likes received</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.likesReceived ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Likes given</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.likesGiven ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Warnings/strikes</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.warnings ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Account type</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.accountType ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Country</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.country ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2"><p className="text-xs text-muted-foreground">Verification method</p><p className="mt-1 text-sm text-foreground">{selectedAnalytics.verificationMethod ?? "N/A"}</p></div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Created at</p>
                  <p className="mt-1 break-words text-sm text-foreground">{selectedAnalytics.createdAt ?? "N/A"}</p>
                </div>
                <div className="rounded-md bg-background/80 p-2">
                  <p className="text-xs text-muted-foreground">Last active</p>
                  <p className="mt-1 break-words text-sm text-foreground">{selectedAnalytics.lastActiveAt ?? "N/A"}</p>
                </div>
              </div>
            </div>
          ) : null}
          {action === "delete_user" ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Type DELETE to confirm</span>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={actionPending}
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={actionPending || (action === "delete_user" && confirmText !== "DELETE")}
              onClick={() => {
                setConfirmOpen(false);
                void submitAction();
              }}
            >
              {actionPending ? "Applying..." : "Confirm Action"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
