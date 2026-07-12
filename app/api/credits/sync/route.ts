import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { syncAnnualSubscriptionCreditsByUserId } from "@/lib/creditSubscriptionSync";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data } = await supabaseAdmin.auth.getUser(token);
    if (!data?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const result = await syncAnnualSubscriptionCreditsByUserId(data.user.id);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to sync subscription credits" },
      { status: 500 },
    );
  }
}
