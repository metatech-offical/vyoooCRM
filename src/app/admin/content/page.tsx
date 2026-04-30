"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type HiveStatus = "pending" | "clear" | "review" | "blocked" | "error" | "skipped" | "approved";

type Report = {
  id: string;
  title: string;
  type: string;
  status: HiveStatus;
  reportsCount: number;
  username?: string;
  userId?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  likes?: number;
  comments?: number;
  views?: number;
  createdAt?: string | null;
  visibleInFeed: boolean;
  moderation: {
    provider: string;
    status: HiveStatus;
    score: number;
    reasons: string[];
    checkedAt?: string | null;
    mediaUrl?: string | null;
  };
};

type ModerationAction = "remove" | "restrict" | "shadow_ban" | "feature" | "promote" | "delete_permanently";
type DeleteImpactPreview = {
  preview?: boolean;
  reelDocExists?: boolean;
  relatedMatched?: number;
  relatedBreakdown?: Record<string, number>;
  fileCandidates?: number;
  error?: string;
};

type DeleteExecutionResult = {
  ok?: boolean;
  relatedDeleted?: number;
  fileDeleteCount?: number;
  verification?: {
    cleanupComplete?: boolean;
    reelDocExistsAfter?: boolean;
    remainingRelated?: number;
    remainingBreakdown?: Record<string, number>;
    remainingStorageFiles?: number;
  };
  error?: string;
};

const ACTION_OPTIONS: { value: ModerationAction; label: string }[] = [
  { value: "restrict", label: "Send to Review" },
  { value: "remove", label: "Block" },
  { value: "shadow_ban", label: "Shadow Ban" },
  { value: "delete_permanently", label: "Delete Permanently" },
  { value: "feature", label: "Mark Clear + Feature" },
  { value: "promote", label: "Mark Clear + Promote" },
];

function allowedActionsByStatus(status: HiveStatus): ModerationAction[] {
  if (status === "clear" || status === "approved") {
    // Already safe in Hive; only show editorial or hard override actions.
    return ["feature", "promote", "remove", "shadow_ban", "delete_permanently"];
  }
  if (status === "pending" || status === "review" || status === "skipped" || status === "error") {
    return ["restrict", "feature", "promote", "remove", "shadow_ban", "delete_permanently"];
  }
  if (status === "blocked") {
    return ["feature", "promote", "remove", "delete_permanently"];
  }
  return ["restrict", "feature", "promote", "remove", "shadow_ban", "delete_permanently"];
}

const HIVE_STATUSES: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Hive statuses" },
  { value: "pending", label: "pending" },
  { value: "clear", label: "clear" },
  { value: "review", label: "review" },
  { value: "blocked", label: "blocked" },
  { value: "error", label: "error" },
  { value: "skipped", label: "skipped" },
  { value: "approved", label: "approved (legacy)" },
];

export default function ContentPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string; action: ModerationAction } | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeleteImpactPreview | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<DeleteExecutionResult["verification"] | null>(null);
  const [cleanupSummary, setCleanupSummary] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, visibility: visibilityFilter });
      const res = await fetch(`/api/admin/content/reports?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load reels (${res.status})`);
      const payload = (await res.json()) as { reports?: Report[] };
      setReports(payload.reports ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reels moderation queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReports();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, visibilityFilter]);

  async function applyAction(contentId: string, action: ModerationAction) {
    setPendingId(contentId);
    if (action !== "delete_permanently") {
      setCleanupReport(null);
      setCleanupSummary(null);
    }
    try {
      const res = await fetch(`/api/admin/content/${contentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: "manual_review" }),
      });
      const payload = (await res.json()) as DeleteExecutionResult;
      if (!res.ok || payload.ok !== true) throw new Error(payload.error ?? `Action failed (${res.status})`);
      if (action === "delete_permanently") {
        setCleanupReport(payload.verification ?? null);
        setCleanupSummary(
          `Deleted ${payload.relatedDeleted ?? 0} related records and ${payload.fileDeleteCount ?? 0} storage files.`
        );
      }
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply moderation action");
    } finally {
      setPendingId(null);
    }
  }

  async function loadDeletePreview(contentId: string) {
    setDeletePreviewLoading(true);
    setDeletePreview(null);
    try {
      const res = await fetch(`/api/admin/content/${contentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_permanently", reason: "manual_review", previewOnly: true }),
      });
      const payload = (await res.json()) as DeleteImpactPreview;
      if (!res.ok) {
        throw new Error(payload.error ?? `Failed to load delete impact (${res.status})`);
      }
      setDeletePreview(payload);
    } catch (err) {
      setDeletePreview({ error: err instanceof Error ? err.message : "Failed to load delete impact preview" });
    } finally {
      setDeletePreviewLoading(false);
    }
  }

  function statusVariant(status: HiveStatus): "secondary" | "destructive" | "outline" {
    if (status === "blocked" || status === "error") return "destructive";
    if (status === "review" || status === "pending" || status === "skipped") return "secondary";
    return "outline";
  }

  const hiddenCount = useMemo(() => reports.filter((item) => !item.visibleInFeed).length, [reports]);
  const visibleCount = useMemo(() => reports.filter((item) => item.visibleInFeed).length, [reports]);
  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (!search.trim()) return sortedReports;
    const q = search.trim().toLowerCase();
    return sortedReports.filter((item) =>
      [item.title, item.caption ?? "", item.username ?? "", item.userId ?? "", item.id]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [sortedReports, search]);

  const previewBreakdownEntries = useMemo(() => {
    const raw = Object.entries(deletePreview?.relatedBreakdown ?? {});
    return raw
      .filter(([, count]) => Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [deletePreview]);

  const cleanupRemainingEntries = useMemo(() => {
    const raw = Object.entries(cleanupReport?.remainingBreakdown ?? {});
    return raw.filter(([, count]) => Number(count) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [cleanupReport]);

  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">Reels Moderation (Hive)</h2>
        <p className="crm-page-subtitle">
          Feed-visible statuses: <strong>clear</strong> and <strong>approved</strong>. All other statuses stay hidden.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reels in Queue</CardTitle></CardHeader>
          <CardContent className="crm-kpi-value">{reports.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Visible in Feed</CardTitle></CardHeader>
          <CardContent className="crm-kpi-value">{visibleCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Hidden from Feed</CardTitle></CardHeader>
          <CardContent className="crm-kpi-value">{hiddenCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <input
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, caption, creator, reel id"
            />
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {HIVE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}>
              <option value="all">All visibility</option>
              <option value="visible">Visible in feed</option>
              <option value="hidden">Hidden from feed</option>
            </select>
          </CardContent>
        </Card>
      </div>

      {error ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}
      {cleanupSummary ? (
        <div className={`rounded-md border px-3 py-2 text-sm ${cleanupReport?.cleanupComplete ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          <p className="font-medium">{cleanupReport?.cleanupComplete ? "Cleanup complete" : "Cleanup completed with remaining data"}</p>
          <p>{cleanupSummary}</p>
          {cleanupReport ? (
            <p className="mt-1 text-xs">
              Reel exists after delete: {cleanupReport.reelDocExistsAfter ? "yes" : "no"} | Remaining related records: {cleanupReport.remainingRelated ?? 0} | Remaining storage files: {cleanupReport.remainingStorageFiles ?? 0}
            </p>
          ) : null}
          {!cleanupReport?.cleanupComplete && cleanupRemainingEntries.length > 0 ? (
            <div className="mt-2 max-h-32 overflow-auto rounded border bg-background/70 p-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide">Remaining by source</p>
              <ul className="space-y-1 text-xs">
                {cleanupRemainingEntries.map(([source, count]) => (
                  <li key={source} className="flex items-center justify-between">
                    <span className="font-mono">{source}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading reels moderation queue...</CardContent></Card>
        ) : null}

        {!loading && filteredReports.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <ShieldCheck className="size-8 text-muted-foreground/70" />
                <p>No reels match this Hive moderation filter.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {filteredReports.map((r) => (
          <Card key={r.id} className="overflow-hidden">
            <div className="grid gap-4 p-4 md:grid-cols-[300px_1fr]">
              <div className="overflow-hidden rounded-md border bg-muted/30">
                {(r.mediaUrl || r.thumbnailUrl) ? (
                  r.type === "video" ? (
                    <video
                      key={r.id}
                      src={r.mediaUrl || undefined}
                      poster={r.thumbnailUrl || undefined}
                      controls
                      preload="metadata"
                      className="h-56 w-full bg-black object-cover"
                    />
                  ) : (
                    <Image
                      src={(r.thumbnailUrl || r.mediaUrl) as string}
                      alt={r.title}
                      width={640}
                      height={360}
                      className="h-56 w-full object-cover"
                      unoptimized
                    />
                  )
                ) : (
                  <div className="flex h-56 items-center justify-center px-3 text-center text-xs text-muted-foreground">
                    Media preview unavailable
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold leading-snug">{r.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Reel ID: <span className="font-mono">{r.id}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.type}</Badge>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  <Badge variant={r.visibleInFeed ? "outline" : "destructive"}>{r.visibleInFeed ? "Visible in feed" : "Hidden from feed"}</Badge>
                  <Badge variant={r.reportsCount >= 3 ? "destructive" : "outline"}>Reports: {r.reportsCount}</Badge>
                </div>

                {(r.status === "clear" || r.status === "approved") ? (
                  <p className="text-xs text-emerald-700">
                    Hive marked this content as safe. Review action is hidden unless moderation state changes.
                  </p>
                ) : null}

                <div className="grid gap-1 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-2">
                  <p><span className="font-medium text-foreground">Creator:</span> {r.username || "-"}</p>
                  <p><span className="font-medium text-foreground">User ID:</span> {r.userId || "-"}</p>
                  <p><span className="font-medium text-foreground">Created:</span> {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</p>
                  <p><span className="font-medium text-foreground">Provider:</span> {r.moderation.provider || "hive"}</p>
                  <p><span className="font-medium text-foreground">Score:</span> {r.moderation.score}</p>
                  <p><span className="font-medium text-foreground">Reasons:</span> {r.moderation.reasons.length > 0 ? r.moderation.reasons.join(", ") : "None"}</p>
                  <p><span className="font-medium text-foreground">Checked At:</span> {r.moderation.checkedAt ? new Date(r.moderation.checkedAt).toLocaleString() : "-"}</p>
                  <p><span className="font-medium text-foreground">Engagement:</span> {r.likes ?? 0} likes, {r.comments ?? 0} comments, {r.views ?? 0} views</p>
                </div>

                <details className="rounded-md border p-2">
                  <summary className="cursor-pointer text-xs font-medium">Caption and moderation metadata</summary>
                  <p className="mt-2 text-xs">{r.caption || "No caption"}</p>
                  <pre className="mt-2 max-h-40 overflow-auto rounded border bg-muted p-2 text-[11px]">
                    {JSON.stringify(r.moderation, null, 2)}
                  </pre>
                </details>

                <div className="flex flex-wrap gap-2">
                {ACTION_OPTIONS.filter((opt) => allowedActionsByStatus(r.status).includes(opt.value)).map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingId === r.id}
                      onClick={() => {
                        if (opt.value === "remove" || opt.value === "shadow_ban" || opt.value === "delete_permanently") {
                          setConfirmTarget({ id: r.id, title: r.title, action: opt.value });
                          setConfirmOpen(true);
                          if (opt.value === "delete_permanently") {
                            void loadDeletePreview(r.id);
                          } else {
                            setDeletePreview(null);
                            setDeletePreviewLoading(false);
                          }
                          return;
                        }
                        void applyAction(r.id, opt.value);
                      }}
                    >
                      {pendingId === r.id ? "Applying..." : opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Hive moderation override</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to <strong>{confirmTarget?.action ?? "apply action"}</strong> for <strong>{confirmTarget?.title ?? "selected reel"}</strong>.
              {confirmTarget?.action === "delete_permanently"
                ? " This permanently deletes the reel, related comments/likes/reports, and linked storage files."
                : " This may hide content from feed immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmTarget?.action === "delete_permanently" ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Delete impact preview</p>
              {deletePreviewLoading ? (
                <p className="mt-1 text-muted-foreground">Calculating affected records... You can still confirm without waiting.</p>
              ) : deletePreview?.error ? (
                <p className="mt-1 text-red-600">{deletePreview.error}</p>
              ) : (
                <>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <p><span className="font-medium">Reel exists:</span> {deletePreview?.reelDocExists ? "Yes" : "No"}</p>
                    <p><span className="font-medium">Storage files linked:</span> {deletePreview?.fileCandidates ?? 0}</p>
                    <p><span className="font-medium">Total matched records:</span> {deletePreview?.relatedMatched ?? 0}</p>
                    <p><span className="font-medium">Mode:</span> Preview only (no data deleted)</p>
                  </div>
                  <div className="mt-3 rounded-md border bg-background/80 p-2">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Matched records by source</p>
                    {previewBreakdownEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No related records found.</p>
                    ) : (
                      <div className="max-h-40 overflow-auto">
                        <ul className="space-y-1 text-sm">
                          {previewBreakdownEntries.map(([source, count]) => (
                            <li key={source} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1">
                              <span className="font-mono text-xs">{source}</span>
                              <span className="font-medium">{count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pendingId !== null}
              onClick={() => {
                setDeletePreview(null);
                setDeletePreviewLoading(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!confirmTarget || pendingId !== null}
              onClick={() => {
                if (!confirmTarget) return;
                setConfirmOpen(false);
                setDeletePreview(null);
                setDeletePreviewLoading(false);
                void applyAction(confirmTarget.id, confirmTarget.action);
              }}
            >
              <AlertTriangle className="mr-1 size-4" />
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
