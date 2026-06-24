import Link from "next/link";
import { VyoooLogo } from "@/components/branding/vyooo-logo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
      <VyoooLogo variant="red" width={240} height={64} className="mb-4 h-14" priority />
      <h1 className="text-4xl font-bold">Vyooo Admin Dashboard</h1>
      <p className="mt-4 text-zinc-600">Production-grade control plane for analytics, user management, CMS, and system monitoring.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Admin Login</Link>
        <Link href="/admin" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">Dashboard</Link>
      </div>
    </main>
  );
}
