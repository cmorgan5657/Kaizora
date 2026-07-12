import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  try {
    console.log("🧪 Testing supabaseAdmin connection...");

    // Test writing to webhook_logs
    const { data, error } = await supabaseAdmin
      .from("webhook_logs")
      .insert({
        event_type: "test.manual",
        event_id: "test_" + Date.now(),
        status: "success",
        payload: { test: true },
        error_message: null,
      })
      .select();

    if (error) {
      console.error("❌ Supabase error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error,
        },
        { status: 500 }
      );
    }

    console.log("✅ Successfully wrote to database:", data);

    return NextResponse.json({
      success: true,
      message: "Test webhook logged successfully",
      data,
    });
  } catch (error: any) {
    console.error("❌ Catch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
