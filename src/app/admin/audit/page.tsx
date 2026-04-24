import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Log = { id: string; action: string; actorUid: string; actorRole: string; targetType: string; targetId: string; createdAt: string };

async function getLogs(): Promise<Log[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/admin/audit`, { cache: "no-store" });
  if (!res.ok) return [];
  return ((await res.json()) as { logs: Log[] }).logs;
}

export default async function AuditPage() {
  const logs = await getLogs();
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Audit Logs</h2>
        <p className="mt-1 text-sm text-muted-foreground">All privileged admin actions are traced here.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{new Date(l.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{l.actorUid} ({l.actorRole})</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell>{l.targetType}:{l.targetId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
