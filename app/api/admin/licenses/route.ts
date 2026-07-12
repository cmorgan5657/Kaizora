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

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// GET — list all license types
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabaseAdmin
    .from("license_types")
    .select("*")
    .order("price_multiplier", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ licenses: data || [] });
}

// POST — create a license type
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const payload = {
    slug: body.slug?.trim() ? slugify(body.slug) : slugify(body.name),
    name: body.name.trim(),
    description: body.description?.trim() || null,
    price_multiplier: Number(body.price_multiplier) || 1,
    is_active: body.is_active !== false,
  };

  const { data, error } = await supabaseAdmin
    .from("license_types")
    .insert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ license: data });
}

// PATCH — update a license type
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.slug !== undefined) updates.slug = slugify(body.slug);
  if (body.description !== undefined)
    updates.description = body.description?.trim() || null;
  if (body.price_multiplier !== undefined)
    updates.price_multiplier = Number(body.price_multiplier) || 1;
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;

  const { data, error } = await supabaseAdmin
    .from("license_types")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ license: data });
}

// DELETE — remove a license type (?id=)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("license_types")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
