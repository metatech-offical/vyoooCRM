import { RealtimeHealth } from "@/components/admin/realtime-health";

export default function MonitoringPage() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">System Monitoring</h2>
        <p className="mt-1 text-sm text-muted-foreground">Live infrastructure health from Firebase Realtime Database.</p>
      </div>
      <RealtimeHealth />
    </section>
  );
}
