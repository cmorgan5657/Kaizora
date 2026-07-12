import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";
import { DEFAULT_ROYALTY_PERCENT } from "@/lib/licenses";

/**
 * Reads the current platform royalty percentage from platform_settings.
 * Falls back to DEFAULT_ROYALTY_PERCENT (3) if the table/row is missing.
 *
 * This royalty is paid to the ORIGINAL creator when a remix/resale of their
 * Commercial-licensed asset is sold downstream.
 */
export async function getRoyaltyPercent(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("value_number")
      .eq("key", "royalty_percent")
      .maybeSingle();

    if (error || !data) return DEFAULT_ROYALTY_PERCENT;
    const v = Number(data.value_number);
    if (isNaN(v) || v < 0 || v > 100) return DEFAULT_ROYALTY_PERCENT;
    return v;
  } catch {
    return DEFAULT_ROYALTY_PERCENT;
  }
}

// GET — current royalty % (superadmin only)
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user || userData.user.email !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("*")
      .eq("key", "royalty_percent")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({
        success: true,
        royalty_percent: DEFAULT_ROYALTY_PERCENT,
        is_default: true,
        db_error: error.message,
        hint: "platform_settings table missing — run the SQL migration to enable persistence",
      });
    }

    return NextResponse.json({
      success: true,
      royalty_percent: data?.value_number ?? DEFAULT_ROYALTY_PERCENT,
      is_default: !data,
      updated_at: data?.updated_at || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — update royalty % (superadmin only)
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user || userData.user.email !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { royalty_percent } = await req.json();
    const num = Number(royalty_percent);
    if (isNaN(num) || num < 0 || num > 100) {
      return NextResponse.json(
        { error: "royalty_percent must be a number between 0 and 100" },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin.from("platform_settings").upsert(
      {
        key: "royalty_percent",
        value_number: num,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) {
      return NextResponse.json(
        {
          error: "Could not save royalty. Did you run the platform_settings SQL?",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, royalty_percent: num });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
