import { runSearchOptimizationBatchAgent } from "@/lib/agents/searchOptimizationBatchAgent";

export async function POST() {
  try {
    const result = await runSearchOptimizationBatchAgent();
    return Response.json({ success: true, result });
  } catch (e: any) {
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
