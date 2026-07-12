import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";

async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Unauthorized", status: 401 as const };
  const { data } = await supabaseAdmin.auth.getUser(token);
  if (!data?.user) return { error: "Invalid user", status: 401 as const };
  if (data.user.email !== SUPERADMIN_EMAIL)
    return { error: "Forbidden", status: 403 as const };
  return { user: data.user };
}

// GET — list all DMCA notices
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabaseAdmin
    .from("dmca_notices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notices: data || [] });
}

// PATCH — update a notice's status
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, status } = await req.json();
  if (!id || !status)
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  if (!["pending", "actioned", "dismissed"].includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("dmca_notices")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notice: data });
}

// DELETE — remove a notice (?id=)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("dmca_notices")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
