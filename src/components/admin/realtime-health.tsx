"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { clientConfigError, clientRtdb } from "@/lib/firebase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Health = {
  healthyStreams: number;
  errorsLastHour: number;
  latencyP95: string;
  nodesOnline: number;
};

const fallback: Health = { healthyStreams: 0, errorsLastHour: 0, latencyP95: "0 ms", nodesOnline: 0 };

export function RealtimeHealth() {
  const [health, setHealth] = useState<Health>(fallback);

  useEffect(() => {
    if (!clientRtdb) {
      return;
    }

    const healthRef = ref(clientRtdb, "systemHealth");
    const unsubscribe = onValue(healthRef, (snapshot) => {
      const val = (snapshot.val() as Partial<Health> | null) ?? {};
      setHealth({
        healthyStreams: val.healthyStreams ?? 0,
        errorsLastHour: val.errorsLastHour ?? 0,
        latencyP95: val.latencyP95 ?? "0 ms",
        nodesOnline: val.nodesOnline ?? 0,
      });
    });

    return () => unsubscribe();
  }, []);

  const cards = [
    { label: "Healthy Streams", value: String(health.healthyStreams) },
    { label: "Errors (1h)", value: String(health.errorsLastHour) },
    { label: "Latency P95", value: health.latencyP95 },
    { label: "Nodes Online", value: String(health.nodesOnline) },
  ];

  return (
    <>
      {clientConfigError ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {clientConfigError}. Live monitoring is disabled until config is set.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
