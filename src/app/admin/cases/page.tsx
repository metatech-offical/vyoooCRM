"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AdminCase = {
  id: string;
  status: string;
  priority: string;
  subjectType: string;
  subjectId: string;
  reasonCode?: string;
  ownerUid?: string;
  updatedAt?: string;
};

export default function CasesPage() {
  const [items, setItems] = useState<AdminCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cases?limit=100&status=${statusFilter}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load cases (${res.status})`);
      const data = (await res.json()) as { cases?: AdminCase[] };
      setItems(data.cases ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load cases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openCount = useMemo(() => items.filter((c) => c.status === "open").length, [items]);
  const highCount = useMemo(() => items.filter((c) => c.priority === "high").length, [items]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  function caseStatusVariant(status: string): "secondary" | "outline" | "destructive" {
    if (status === "resolved") return "outline";
    if (status === "investigating") return "secondary";
    return "destructive";
  }

  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">Case Management</h2>
        <p className="crm-page-subtitle">
          One place to track moderation and support issues, owners, and priority.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Cases</CardTitle></CardHeader>
          <CardContent className="crm-kpi-value">{items.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Open Cases</CardTitle></CardHeader>
          <CardContent className="crm-kpi-value">{openCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">High Priority</CardTitle></CardHeader>
          <CardContent className="crm-kpi-value">{highCount}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cases</CardTitle>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">Loading cases...</TableCell>
                </TableRow>
              ) : null}
              {!loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FolderSearch className="size-8 text-muted-foreground/70" />
                      <p>No cases found for this status.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              {items.map((c) => (
                <TableRow
                  key={c.id}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedCaseId((prev) => (prev === c.id ? null : c.id));
                    }
                  }}
                  onClick={() => setSelectedCaseId((prev) => (prev === c.id ? null : c.id))}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs">{c.id}</TableCell>
                  <TableCell><Badge variant={caseStatusVariant(c.status)}>{c.status}</Badge></TableCell>
                  <TableCell><Badge variant={c.priority === "high" ? "destructive" : "outline"}>{c.priority}</Badge></TableCell>
                  <TableCell>{c.subjectType}:{c.subjectId}</TableCell>
                  <TableCell>{c.reasonCode ?? "-"}</TableCell>
                  <TableCell>{c.ownerUid ?? "Unassigned"}</TableCell>
                  <TableCell>{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedCaseId ? (
        <Card>
          <CardHeader>
            <CardTitle>Case Details</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(() => {
              const selected = items.find((item) => item.id === selectedCaseId);
              if (!selected) return "Case not found.";
              return (
                <div className="grid gap-2 md:grid-cols-2">
                  <p><span className="font-medium text-foreground">Case ID:</span> {selected.id}</p>
                  <p><span className="font-medium text-foreground">Status:</span> {selected.status}</p>
                  <p><span className="font-medium text-foreground">Priority:</span> {selected.priority}</p>
                  <p><span className="font-medium text-foreground">Owner:</span> {selected.ownerUid ?? "Unassigned"}</p>
                  <p><span className="font-medium text-foreground">Subject:</span> {selected.subjectType}:{selected.subjectId}</p>
                  <p><span className="font-medium text-foreground">Reason:</span> {selected.reasonCode ?? "-"}</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
