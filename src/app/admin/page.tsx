import { RealtimeKpis } from "@/components/admin/realtime-kpis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <section className="crm-page">
      <div className="crm-page-header">
        <h2 className="crm-page-title">Dashboard Overview</h2>
        <p className="crm-page-subtitle">
          Quick health summary for users, content, and engagement. Data updates automatically.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">How to use this page</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Check high-level numbers first, then move to Users, Cases, or CMS for action.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Operator Tip</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Prioritize high-risk users and high-report content before low-priority tasks.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Data Source</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Metrics are calculated from your live Firebase collections.
          </CardContent>
        </Card>
      </div>
      <RealtimeKpis />
    </section>
  );
}
