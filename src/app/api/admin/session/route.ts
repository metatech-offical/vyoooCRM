import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) return NextResponse.json({ error: "idToken required" }, { status: 400 });

    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const role = decoded.role as "admin" | "moderator" | "support" | undefined;
    if (!role) return NextResponse.json({ error: "Missing admin role claim" }, { status: 403 });

    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: 1000 * 60 * 60 * 24 * 5 });
    (await cookies()).set({ name: SESSION_COOKIE_NAME, value: sessionCookie, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });

    await logAdminAction({ actorUid: decoded.uid, actorRole: role, action: "auth.session.created", targetType: "auth", targetId: decoded.uid });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Firebase ID token has incorrect \"aud\"")) {
      return NextResponse.json(
        { error: "Token project mismatch. Ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID and FIREBASE_PROJECT_ID point to the same Firebase project." },
        { status: 401 }
      );
    }
    if (message.includes("Firebase ID token has incorrect \"iss\"")) {
      return NextResponse.json(
        { error: "Token issuer mismatch. Verify App Hosting secrets for Firebase project and service account." },
        { status: 401 }
      );
    }
    if (message.includes("ID token has expired")) {
      return NextResponse.json({ error: "ID token expired. Please sign in again." }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create admin session" }, { status: 500 });
  }
}
