import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";

const DEFAULT_FEE_PERCENT = 10;

/**
 * Reads the current platform fee percentage from the platform_settings table.
 * Falls back to DEFAULT_FEE_PERCENT (10) if table missing or row absent.
 */
export async function getPlatformFeePercent(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("value_number")
      .eq("key", "platform_fee_percent")
      .maybeSingle();

    if (error || !data) return DEFAULT_FEE_PERCENT;
    const v = Number(data.value_number);
    if (isNaN(v) || v < 0 || v > 100) return DEFAULT_FEE_PERCENT;
    return v;
  } catch {
    return DEFAULT_FEE_PERCENT;
  }
}

// GET — return current fee + history (only readable by superadmin)
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user || userData.user.email !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("*")
      .eq("key", "platform_fee_percent")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // Table missing or other DB error — return default with hint
      return NextResponse.json({
        success: true,
        platform_fee_percent: DEFAULT_FEE_PERCENT,
        is_default: true,
        db_error: error.message,
        hint: "platform_settings table missing — run the SQL migration to enable persistence",
      });
    }

    return NextResponse.json({
      success: true,
      platform_fee_percent: data?.value_number ?? DEFAULT_FEE_PERCENT,
      is_default: !data,
      updated_at: data?.updated_at || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — update fee (only by superadmin)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user || userData.user.email !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { fee_percent } = await req.json();
    const num = Number(fee_percent);
    if (isNaN(num) || num < 0 || num > 100) {
      return NextResponse.json({ error: "fee_percent must be a number between 0 and 100" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert(
        {
          key: "platform_fee_percent",
          value_number: num,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );

    if (error) {
      return NextResponse.json({
        error: "Could not save fee. Did you run the platform_settings SQL?",
        details: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, platform_fee_percent: num });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
