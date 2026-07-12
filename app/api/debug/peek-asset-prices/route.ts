import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id, title, price_cents, is_public, content_type")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const summary = {
    total: data?.length || 0,
    free: (data || []).filter((a: any) => !a.price_cents || a.price_cents === 0).length,
    paid: (data || []).filter((a: any) => a.price_cents && a.price_cents > 0).length,
    null_price: (data || []).filter((a: any) => a.price_cents === null).length,
  };

  return Response.json({
    summary,
    assets: (data || []).map((a: any) => ({
      title: a.title,
      content_type: a.content_type,
      price_cents: a.price_cents,
      price_dollars: a.price_cents ? `$${(a.price_cents / 100).toFixed(2)}` : "Free",
    })),
  });
}
