"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const nav = [
  { href: "/admin", label: "Analytics" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/cases", label: "Cases" },
  { href: "/admin/content", label: "CMS" },
  { href: "/admin/monitoring", label: "Monitoring" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 border-r bg-background p-4">
      <div className="mb-4 flex items-center justify-between">
        <Image
          src="/branding/vyooo-red-transparent.png"
          alt="Vyooo"
          width={120}
          height={30}
          className="h-8 w-auto"
          priority
        />
        <Badge variant="secondary">v1</Badge>
      </div>
      <Separator className="mb-3" />
      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm transition ${pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
