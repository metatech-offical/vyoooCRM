"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { clientAuth, clientConfigError } from "@/lib/firebase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    if (!clientAuth) {
      setError("Firebase web config is missing. Add NEXT_PUBLIC_FIREBASE_* values in .env.local.");
      setPending(false);
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(clientAuth, email, password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error("login");
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Login failed. Check credentials and admin role claim.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <Image
            src="/branding/vyooo-red-transparent.png"
            alt="Vyooo"
            width={180}
            height={46}
            className="mb-2 h-10 w-auto"
            priority
          />
          <CardTitle>Admin Login</CardTitle>
          <CardDescription>Sign in with Firebase admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          {clientConfigError ? (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {clientConfigError}. Add Firebase web app keys and reload.
            </p>
          ) : null}
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@vyooo.com" required />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in..." : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
