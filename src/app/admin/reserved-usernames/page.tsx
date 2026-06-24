"use client";

import { useEffect, useMemo, useState } from "react";
import { AtSign, Search } from "lucide-react";
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

type ReservedUsername = {
  id: string;
  username: string;
  category?: string;
  active: boolean;
  source?: string;
  assignedTo?: string;
  assignedAt?: string;
};

type ReservedResponse = {
  policy?: { minLength: number; maxLength: number };
  items: ReservedUsername[];
  pageInfo?: { nextCursor?: string | null; hasMore?: boolean };
};

export default function ReservedUsernamesPage() {
  const [items, setItems] = useState<ReservedUsername[]>([]);
  const [policy, setPolicy] = useState({ minLength: 4, maxLength: 30 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUsername, setAssignUsername] = useState("");
  const [assignUid, setAssignUid] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignPending, setAssignPending] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  async function loadItems(cursor?: string, append = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (query.trim()) params.set("q", query.trim());
      if (activeOnly) params.set("active", "true");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/admin/reserved-usernames?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load reserved usernames (${res.status})`);

      const data = (await res.json()) as ReservedResponse;
      setPolicy(data.policy ?? { minLength: 4, maxLength: 30 });
      setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
      setNextCursor(data.pageInfo?.nextCursor ?? null);
      setHasMore(Boolean(data.pageInfo?.hasMore));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reserved usernames");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadItems();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedForAssign = useMemo(
    () => items.find((item) => item.username.toLowerCase() === assignUsername.toLowerCase()) ?? null,
    [items, assignUsername]
  );

  async function checkExact(username: string) {
    const params = new URLSearchParams({ exact: "true", q: username });
    const res = await fetch(`/api/admin/reserved-usernames?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as ReservedResponse;
    return data.items[0] ?? null;
  }

  async function submitAssign() {
    setAssignPending(true);
    setAssignSuccess(null);
    try {
      const res = await fetch("/api/admin/reserved-usernames/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: assignUid.trim(),
          username: assignUsername.trim(),
          notes: assignNotes.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; previousUsername?: string; username?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Assignment failed (${res.status})`);
      }
      setAssignSuccess(
        `Assigned @${data.username} to ${assignUid.trim()}${data.previousUsername ? ` (was @${data.previousUsername})` : ""}.`
      );
      setAssignOpen(false);
      setAssignUid("");
      setAssignNotes("");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign reserved username");
    } finally {
      setAssignPending(false);
    }
  }

  function openAssignDialog(username: string) {
    setAssignUsername(username);
    setAssignUid("");
    setAssignNotes("");
    setAssignOpen(true);
  }

  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">Reserved Usernames</h2>
        <p className="crm-page-subtitle">
          Browse the Firebase reserved list. Users who pick a reserved handle during signup get a temporary username
          until your team assigns the paid handle here.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Username policy</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Minimum length: {policy.minLength} characters (3-letter usernames are blocked).</p>
            <p>Maximum length: {policy.maxLength} characters.</p>
            <p className="mt-2">Reserved handles require payment and manual assignment by support.</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Operator workflow</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 pl-4">
              <li>User tries a reserved username in the app and sees a popup to contact your team.</li>
              <li>App saves a temporary username (for example <code>user_abc12345</code>).</li>
              <li>After payment, find the reserved handle below and assign it to the user&apos;s UID.</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search reserved handles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by prefix (e.g. nike, admin)"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
          <Button type="button" onClick={() => void loadItems()}>
            <Search className="mr-2 size-4" />
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQuery("");
              setActiveOnly(true);
              void loadItems();
            }}
          >
            Reset
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}
      {assignSuccess ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{assignSuccess}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Reserved list (Firebase)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading reserved usernames...
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <AtSign className="size-8 text-muted-foreground/70" />
                      <p>No reserved usernames matched your filters.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">@{item.username}</TableCell>
                  <TableCell>{item.category ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "secondary" : "outline"}>{item.active ? "active" : "assigned"}</Badge>
                  </TableCell>
                  <TableCell>{item.source ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.assignedTo ?? "-"}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!item.active}
                      onClick={() => openAssignDialog(item.username)}
                    >
                      Assign to user
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!hasMore || loading || !nextCursor}
              onClick={() => {
                if (!nextCursor) return;
                void loadItems(nextCursor, true);
              }}
            >
              Load more
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={assignOpen} onOpenChange={setAssignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign reserved username</AlertDialogTitle>
            <AlertDialogDescription>
              Assign <strong>@{assignUsername}</strong> to a user after they have paid and reached out. This updates their
              profile and marks the reserved handle as assigned in Firebase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">User UID</span>
              <Input value={assignUid} onChange={(e) => setAssignUid(e.target.value)} placeholder="Firebase user UID" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Reserved username</span>
              <Input
                value={assignUsername}
                onChange={(e) => setAssignUsername(e.target.value)}
                onBlur={() => {
                  if (!assignUsername.trim()) return;
                  void checkExact(assignUsername.trim());
                }}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Internal notes</span>
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Payment reference, ticket ID, etc."
              />
            </label>
            {selectedForAssign && !selectedForAssign.active ? (
              <p className="text-sm text-amber-700">This handle is already assigned or inactive.</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={assignPending || !assignUid.trim() || !assignUsername.trim()}
              onClick={() => void submitAssign()}
            >
              {assignPending ? "Assigning..." : "Confirm assignment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
