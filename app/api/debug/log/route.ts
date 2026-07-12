import { NextRequest, NextResponse } from "next/server";

// Simple terminal-log mirror for client debugging.
// Prints to the Next.js dev server terminal (NOT the browser console).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tag, data } = body ?? {};
    // eslint-disable-next-line no-console
    console.log(`[client→terminal] ${tag || "log"}`, data ?? "");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log("[client→terminal] log parse failed", e);
  }
  return NextResponse.json({ ok: true });
}
