import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// GET — fetch all packs + action costs
export async function GET() {
  const [packsRes, costsRes] = await Promise.all([
    supabaseAdmin
      .from("credit_packs")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("credit_action_costs")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json({
    packs: packsRes.data || [],
    costs: costsRes.data || [],
  });
}

// PUT — update a pack or action cost
export async function PUT(req: NextRequest) {
  const { table, id, data } = await req.json();

  if (!table || !id || !data) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const tableName = table === "packs" ? "credit_packs" : "credit_action_costs";

  const { error } = await supabaseAdmin
    .from(tableName)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// POST — create a new pack or action cost
export async function POST(req: NextRequest) {
  const { table, data } = await req.json();

  if (!table || !data) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const tableName = table === "packs" ? "credit_packs" : "credit_action_costs";

  const { error } = await supabaseAdmin.from(tableName).insert(data);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE — remove a pack or action cost
export async function DELETE(req: NextRequest) {
  const { table, id } = await req.json();

  if (!table || !id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const tableName = table === "packs" ? "credit_packs" : "credit_action_costs";

  const { error } = await supabaseAdmin.from(tableName).delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
