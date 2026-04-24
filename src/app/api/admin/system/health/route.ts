import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminRtdb } from "@/lib/firebase/admin";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    await requireAdmin("system.read");
    if (!adminRtdb) {
      return NextResponse.json(
        { error: "Realtime Database is not configured (NEXT_PUBLIC_FIREBASE_DATABASE_URL missing)." },
        { status: 503 }
      );
    }
    const snap = await adminRtdb.ref("systemHealth").get();
    const h = snap.val() ?? {};
    return NextResponse.json({ healthyStreams: h.healthyStreams ?? 0, errorsLastHour: h.errorsLastHour ?? 0, latencyP95: h.latencyP95 ?? "0 ms", nodesOnline: h.nodesOnline ?? 0 });
  } catch (error) {
    return apiError(error);
  }
}
