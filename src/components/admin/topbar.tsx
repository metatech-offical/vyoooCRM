import { Badge } from "@/components/ui/badge";

export function AdminTopbar({ email, role }: { email?: string; role: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Vyooo CRM</h1>
        <p className="text-xs text-muted-foreground">Simple control panel for daily platform operations</p>
      </div>
      <div className="text-right text-sm">
        <p className="font-medium">{email ?? "Admin"}</p>
        <Badge variant="outline" className="mt-1 uppercase">{role}</Badge>
      </div>
    </header>
  );
}
