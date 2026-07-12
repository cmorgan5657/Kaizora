import { NextRequest, NextResponse } from "next/server";
import { runPostLaunchOptimizer } from "@/lib/agents/postLaunchOptimizer";

export async function POST(req: NextRequest) {
  try {
    await runPostLaunchOptimizer();
    return NextResponse.json({ success: true, message: "Post-launch optimization cycle complete" });
  } catch (error: any) {
    console.error("Optimize-all error:", error);
    return NextResponse.json({ error: "Failed", details: error.message }, { status: 500 });
  }
}
