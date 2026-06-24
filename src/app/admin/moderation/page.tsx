"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Flag, Gavel, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type QueueType =
  | "user_reports"
  | "reel_reports"
  | "story_reports"
  | "comment_reports"
  | "content"
  | "disputes";

type QueueCounts = Partial<Record<QueueType, number>>;

type ReportItem = {
  id: string;
  kind?: string;
  reporterId: string;
  reason: string;
  createdAt: string | null;
  reportedUserId?: string;
  reelId?: string;
  reelOwnerId?: string;
  storyId?: string;
  storyOwnerId?: string;
  commentId?: string;
  commentAuthorId?: string;
  reelIdForComment?: string;
};

type ContentItem = {
  id: string;
  collection: "reels" | "stories";
  userId: string;
  username: string;
  caption: string;
  mediaUrl: string;
  thumbnailUrl: string;
  reportCount: number;
  views: number;
  createdAt: string | null;
  moderation: {
    status: string;
    provider: string;
    reasons: unknown[];
    disputeStatus: unknown;
    removedReason: unknown;
  };
};

type DisputeItem = {
  id: string;
  contentId: string;
  contentCollection: string;
  contentType: string;
  ownerId: string;
  status: string;
  createdAt: string | null;
};

type QueueItem = ReportItem | ContentItem | DisputeItem;

const TABS: Array<{ value: QueueType; label: string }> = [
  { value: "user_reports", label: "User Reports" },
  { value: "reel_reports", label: "Reel Reports" },
  { value: "story_reports", label: "Story Reports" },
  { value: "comment_reports", label: "Comment Reports" },
  { value: "content", label: "Review Queue" },
  { value: "disputes", label: "Disputes" },
];

const USER_ACTIONS = [
  { value: "ban", label: "Ban" },
  { value: "suspend", label: "Suspend" },
  { value: "restrict", label: "Restrict" },
] as const;

function isContentItem(item: QueueItem): item is ContentItem {
  return "collection" in item && "moderation" in item;
}

function isDisputeItem(item: QueueItem): item is DisputeItem {
  return "contentCollection" in item && "ownerId" in item && !("collection" in item);
}

function isReportItem(item: QueueItem): item is ReportItem {
  return "reporterId" in item && !isContentItem(item) && !isDisputeItem(item);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusVariant(status: string): "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "blocked" || s === "banned" || s === "report_covered") return "destructive";
  if (s === "review" || s === "pending" || s === "suspended") return "secondary";
  return "outline";
}

export default function ModerationPage() {
  const [activeTab, setActiveTab] = useState<QueueType>("user_reports");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<QueueCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [staffNote, setStaffNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{
    kind: "user" | "content" | "dispute";
    id: string;
    action: string;
    label: string;
    collection?: string;
    approve?: boolean;
  } | null>(null);

  const loadQueue = useCallback(async (type: QueueType) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, counts: "true", limit: "100" });
      const res = await fetch(`/api/admin/moderation/queues?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load queue (${res.status})`);
      const payload = (await res.json()) as { items?: QueueItem[]; counts?: QueueCounts };
      setItems(payload.items ?? []);
      setCounts(payload.counts ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load moderation queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadQueue(activeTab);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadQueue]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }, [items, search]);

  async function runUserAction(uid: string, action: string) {
    setPendingId(uid);
    try {
      const res = await fetch(`/api/admin/moderation/users/${uid}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reasonCode: "policy_violation", notes: "moderation_queue" }),
      });
      if (!res.ok) throw new Error(`User action failed (${res.status})`);
      await loadQueue(activeTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply user action");
    } finally {
      setPendingId(null);
    }
  }

  async function runContentAction(collection: string, id: string, action: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/admin/moderation/content/${collection}/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: "manual_review" }),
      });
      if (!res.ok) throw new Error(`Content action failed (${res.status})`);
      await loadQueue(activeTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply content action");
    } finally {
      setPendingId(null);
    }
  }

  async function runDisputeResolve(id: string, approve: boolean) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/admin/moderation/disputes/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, staffNote }),
      });
      if (!res.ok) throw new Error(`Dispute resolve failed (${res.status})`);
      setStaffNote("");
      await loadQueue(activeTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve dispute");
    } finally {
      setPendingId(null);
    }
  }

  function openConfirm(target: typeof confirmTarget) {
    setConfirmTarget(target);
    setConfirmOpen(true);
  }

  function targetUserId(item: ReportItem): string | null {
    if (item.reportedUserId) return item.reportedUserId;
    if (item.reelOwnerId) return item.reelOwnerId;
    if (item.storyOwnerId) return item.storyOwnerId;
    if (item.commentAuthorId) return item.commentAuthorId;
    return null;
  }

  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">Moderation</h2>
        <p className="crm-page-subtitle">
          Review user reports, content flags, Hive review queue, and owner disputes. All actions are logged to{" "}
          <code className="text-xs">moderation_actions</code>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {TABS.map((tab) => (
          <Card key={tab.value}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">{tab.label}</CardTitle>
            </CardHeader>
            <CardContent className="crm-kpi-value text-2xl">{counts[tab.value] ?? 0}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <Button
                key={tab.value}
                type="button"
                size="sm"
                variant={activeTab === tab.value ? "default" : "outline"}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search current queue..."
          />
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
          ) : null}

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading moderation queue...</p>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <ShieldAlert className="size-8 opacity-70" />
              <p>No items in this queue.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {activeTab === "content" ? (
                    <>
                      <TableHead>Content</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reports</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </>
                  ) : activeTab === "disputes" ? (
                    <>
                      <TableHead>Dispute</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>Report</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Reporter</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  if (activeTab === "content" && isContentItem(item)) {
                    return (
                      <TableRow key={`${item.collection}-${item.id}`}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{item.caption || item.id}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {item.collection}/{item.id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(item.moderation.status)}>{item.moderation.status}</Badge>
                        </TableCell>
                        <TableCell>{item.reportCount}</TableCell>
                        <TableCell className="font-mono text-xs">{item.userId || item.username || "-"}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingId === item.id}
                              onClick={() =>
                                openConfirm({
                                  kind: "content",
                                  id: item.id,
                                  collection: item.collection,
                                  action: "restore",
                                  label: "Restore content",
                                })
                              }
                            >
                              Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={pendingId === item.id}
                              onClick={() =>
                                openConfirm({
                                  kind: "content",
                                  id: item.id,
                                  collection: item.collection,
                                  action: "hide",
                                  label: "Hide content",
                                })
                              }
                            >
                              Hide
                            </Button>
                            {item.userId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pendingId === item.userId}
                                onClick={() =>
                                  openConfirm({
                                    kind: "user",
                                    id: item.userId,
                                    action: "restrict",
                                    label: "Restrict owner",
                                  })
                                }
                              >
                                Restrict owner
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (activeTab === "disputes" && isDisputeItem(item)) {
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.id}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs">{item.contentType || item.contentCollection}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {item.contentCollection}/{item.contentId}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.ownerId}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingId === item.id}
                              onClick={() =>
                                openConfirm({
                                  kind: "dispute",
                                  id: item.id,
                                  action: "approve",
                                  approve: true,
                                  label: "Approve dispute (restore content)",
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={pendingId === item.id}
                              onClick={() =>
                                openConfirm({
                                  kind: "dispute",
                                  id: item.id,
                                  action: "reject",
                                  approve: false,
                                  label: "Reject dispute (keep covered)",
                                })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (!isReportItem(item)) return null;
                  const uid = targetUserId(item);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell>{item.reason || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.reporterId}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.reportedUserId ||
                          item.reelId ||
                          item.storyId ||
                          item.commentId ||
                          "-"}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(item.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {uid
                            ? USER_ACTIONS.map((opt) => (
                                <Button
                                  key={opt.value}
                                  size="sm"
                                  variant={opt.value === "ban" ? "destructive" : "outline"}
                                  disabled={pendingId === uid}
                                  onClick={() =>
                                    openConfirm({
                                      kind: "user",
                                      id: uid,
                                      action: opt.value,
                                      label: `${opt.label} user ${uid}`,
                                    })
                                  }
                                >
                                  {opt.label}
                                </Button>
                              ))
                            : null}
                          {item.reelId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingId === item.reelId}
                              onClick={() =>
                                openConfirm({
                                  kind: "content",
                                  id: item.reelId!,
                                  collection: "reels",
                                  action: "hide",
                                  label: `Hide reel ${item.reelId}`,
                                })
                              }
                            >
                              Hide reel
                            </Button>
                          ) : null}
                          {item.storyId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingId === item.storyId}
                              onClick={() =>
                                openConfirm({
                                  kind: "content",
                                  id: item.storyId!,
                                  collection: "stories",
                                  action: "hide",
                                  label: `Hide story ${item.storyId}`,
                                })
                              }
                            >
                              Hide story
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm moderation action</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget ? (
                <>
                  You are about to <strong>{confirmTarget.label}</strong>. This will be recorded in{" "}
                  <code>moderation_actions</code>.
                </>
              ) : (
                "Confirm this moderation action."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmTarget?.kind === "dispute" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="staff-note">
                Staff note (optional)
              </label>
              <Input
                id="staff-note"
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
                placeholder="Reason for approval or rejection"
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmTarget?.action === "ban" || confirmTarget?.action === "hide" || confirmTarget?.action === "reject" ? "destructive" : "default"}
              disabled={!confirmTarget || pendingId !== null}
              onClick={() => {
                if (!confirmTarget) return;
                setConfirmOpen(false);
                if (confirmTarget.kind === "user") {
                  void runUserAction(confirmTarget.id, confirmTarget.action);
                } else if (confirmTarget.kind === "content" && confirmTarget.collection) {
                  void runContentAction(confirmTarget.collection, confirmTarget.id, confirmTarget.action);
                } else if (confirmTarget.kind === "dispute") {
                  void runDisputeResolve(confirmTarget.id, confirmTarget.approve === true);
                }
              }}
            >
              <Gavel className="mr-1 size-4" />
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Flag className="size-4" />
          Vyooo moderation reference
        </div>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ban sets <code>verificationStatus=banned</code> and disables Firebase Auth.</li>
          <li>Suspend sets <code>verificationStatus=suspended</code>.</li>
          <li>Restrict sets <code>accountType=restricted</code>.</li>
          <li>Hide sets <code>moderation.status=blocked</code> on reels or stories.</li>
          <li>Restore sets <code>moderation.status=clear</code> and <code>reportCount=0</code>.</li>
          <li>Dispute approve/reject mirrors <code>ModerationService.resolveDispute</code> in the Vyooo app.</li>
        </ul>
        <p className="mt-2 flex items-center gap-1 text-xs">
          <AlertTriangle className="size-3.5" />
          Crowd-report auto-cover uses <code>report_covered</code> status (see Cloud Functions thresholds).
        </p>
      </div>
    </section>
  );
}
