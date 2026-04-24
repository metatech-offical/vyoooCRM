"use client";

import { useEffect, useMemo, useState } from "react";
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

type VerificationStatus = "pending" | "submitted" | "in_review" | "verified" | "rejected";

type VerificationRequest = {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  country: string;
  idType: string;
  notes: string;
  pdfUrl: string;
  pdfFileName: string;
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

type ReviewAction = "in_review" | "approved" | "rejected";

export default function VerificationsPage() {
  const [items, setItems] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ReviewAction | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, q: query, limit: "100" });
      const res = await fetch(`/api/admin/verifications?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load requests (${res.status})`);
      const data = (await res.json()) as { requests?: VerificationRequest[] };
      setItems(data.requests ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load verification requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  function statusVariant(status: VerificationStatus): "outline" | "secondary" | "destructive" {
    if (status === "rejected") return "destructive";
    if (status === "pending" || status === "submitted" || status === "in_review") return "secondary";
    return "outline";
  }

  function userStatusLabel(status: VerificationStatus): string {
    if (status === "verified") return "Verified";
    if (status === "pending" || status === "submitted" || status === "in_review") return "Pending review";
    if (status === "rejected") return "Rejected";
    return "Not requested";
  }

  async function applyAction(action: ReviewAction) {
    if (!selected) return;
    if (action === "rejected" && !reviewNote.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/admin/verifications/${selected.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: reviewNote.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Action failed (${res.status})`);
      }
      setConfirmOpen(false);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update verification request");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">Verification Requests</h2>
        <p className="crm-page-subtitle">
          Review identity requests, move to in review, approve, or reject with clear notes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search email, full name, uid" />
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">pending</option>
            <option value="submitted">submitted</option>
            <option value="in_review">in_review</option>
            <option value="verified">verified</option>
            <option value="rejected">rejected</option>
          </select>
          <Button type="button" onClick={() => void loadRequests()}>Apply</Button>
          <Button type="button" variant="outline" onClick={() => { setQuery(""); setStatusFilter("all"); void loadRequests(); }}>Reset</Button>
        </CardContent>
      </Card>

      {error ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>ID Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User App Label</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading verification requests...</TableCell></TableRow>
              ) : null}
              {!loading && items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No verification requests found.</TableCell></TableRow>
              ) : null}
              {items.map((item) => (
                <TableRow key={item.id} tabIndex={0} className="cursor-pointer" onClick={() => setSelectedId((prev) => (prev === item.id ? null : item.id))}>
                  <TableCell>
                    <p className="font-medium">{item.fullName || item.email || item.uid}</p>
                    <p className="text-xs text-muted-foreground">{item.email || item.uid}</p>
                  </TableCell>
                  <TableCell>{item.idType || "-"}</TableCell>
                  <TableCell>{item.country || "-"}</TableCell>
                  <TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell>
                  <TableCell>{userStatusLabel(item.status)}</TableCell>
                  <TableCell>{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "-"}</TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant={selectedId === item.id ? "default" : "outline"} onClick={(e) => { e.stopPropagation(); setSelectedId((prev) => (prev === item.id ? null : item.id)); }}>
                      {selectedId === item.id ? "Close" : "Review"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Review Request: {selected.fullName || selected.email || selected.uid}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2 text-sm">
              <p><span className="font-medium">Request ID:</span> {selected.id}</p>
              <p><span className="font-medium">UID:</span> {selected.uid}</p>
              <p><span className="font-medium">Email:</span> {selected.email || "-"}</p>
              <p><span className="font-medium">ID Type:</span> {selected.idType || "-"}</p>
              <p><span className="font-medium">Country:</span> {selected.country || "-"}</p>
              <p><span className="font-medium">Status:</span> {selected.status}</p>
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium">User notes</p>
              <p className="rounded-md border bg-muted/30 px-3 py-2">{selected.notes || "No notes"}</p>
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium">Document (PDF)</p>
              {selected.pdfUrl ? (
                <a className="text-primary underline underline-offset-4" href={selected.pdfUrl} target="_blank" rel="noreferrer">
                  Open {selected.pdfFileName || "uploaded document"}
                </a>
              ) : (
                <p className="text-muted-foreground">No document URL found.</p>
              )}
            </div>

            <label className="space-y-1 text-sm block">
              <span className="font-medium">Review Note</span>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Add review note (required for rejection)"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirmAction("in_review"); setConfirmOpen(true); }}>
                Move to In Review
              </Button>
              <Button type="button" disabled={pending} onClick={() => { setConfirmAction("approved"); setConfirmOpen(true); }}>
                Approve (Verified)
              </Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={() => { setConfirmAction("rejected"); setConfirmOpen(true); }}>
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm verification action</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "in_review" && "Move this request to in_review status?"}
              {confirmAction === "approved" && "Approve this request? This sets request status to verified and updates users/{uid}."}
              {confirmAction === "rejected" && "Reject this request? This sets request status to rejected and updates users/{uid}."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !confirmAction}
              variant={confirmAction === "rejected" ? "destructive" : "default"}
              onClick={() => {
                if (!confirmAction) return;
                void applyAction(confirmAction);
              }}
            >
              {pending ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
