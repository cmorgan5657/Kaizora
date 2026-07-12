// /app/api/stripe/transfer-to-seller/route.ts
// Thin HTTP wrapper — the actual split logic lives in lib/transferToSeller.ts
// so server code (e.g. the Stripe webhook) can call it directly.

import { NextResponse } from "next/server";
import { transferToSeller } from "@/lib/transferToSeller";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await transferToSeller(body);
    return NextResponse.json(result, {
      status: result.success || result.error?.startsWith("Seller") ? 200 : 400,
    });
  } catch (err: any) {
    console.error("❌ Transfer error:", err);
    return NextResponse.json(
      { error: err.message, success: false },
      { status: 500 },
    );
  }
}
