import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const stage =
      typeof body?.stage === "string" ? body.stage : "unknown_stage";
    const payload = body?.payload ?? {};

    console.log(
      "[decision-layer-handoff]",
      JSON.stringify({
        at: new Date().toISOString(),
        stage,
        payload,
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(
      "[decision-layer-handoff] logger failure",
      error?.message || error,
    );
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
