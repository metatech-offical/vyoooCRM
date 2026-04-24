"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Kpi = { label: string; value: string; trend?: string };

const defaults: Kpi[] = [
  { label: "Daily Active Users", value: "0" },
  { label: "Monthly Active Users", value: "0" },
  { label: "Live Streams", value: "0" },
  { label: "Published Reels", value: "0" },
  { label: "Total Views", value: "0" },
  { label: "Total Likes", value: "0" },
  { label: "Engagement", value: "0%" },
  { label: "Total Users", value: "0" },
];

export function RealtimeKpis() {
  const [kpis, setKpis] = useState<Kpi[]>(defaults);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await fetch("/api/admin/analytics/overview", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }
        const payload = (await res.json()) as { kpis?: Kpi[] };
        if (!mounted) return;
        setKpis(payload.kpis?.length ? payload.kpis : defaults);
        setFetchError(null);
      } catch (error) {
        if (!mounted) return;
        setFetchError(error instanceof Error ? error.message : "Unable to load analytics");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    interval = setInterval(load, 15000);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <>
      {fetchError ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Live analytics are temporarily unavailable: {fetchError}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-20" /> : <p className="crm-kpi-value">{kpi.value}</p>}
              {kpi.trend ? <p className="mt-1 text-xs text-emerald-600">{kpi.trend}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
