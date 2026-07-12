import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getRoyaltyPercent } from "@/app/api/admin/royalty/route";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    const user = data?.user;

    if (error || !user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    // Get all sales where this user is the seller
    const { data: sales, error: salesError } = await supabaseAdmin
      .from("purchased_assets")
      .select(
        `
        id,
        purchase_price,
        purchased_at,
        seller_id,
        buyer_id,
        asset_id
      `
      )
      .eq("seller_id", user.id)
      .order("purchased_at", { ascending: false });

    if (salesError) {
      console.error("Sales fetch error:", salesError);
      return NextResponse.json(
        { error: "Failed to fetch sales" },
        { status: 500 }
      );
    }

    // Fetch all related data
    const transactions = await Promise.all(
      (sales || []).map(async (sale) => {
        // Get buyer email from auth.users (correct location)
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
          sale.buyer_id
        );
        const buyerEmail = authUser?.user?.email || "Unknown";

        // Get buyer display name from profiles
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", sale.buyer_id)
          .single();

        // Get asset info
        const { data: asset } = await supabaseAdmin
          .from("assets")
          .select("title")
          .eq("id", sale.asset_id)
          .single();

        return {
          id: sale.id,
          purchased_at: sale.purchased_at,
          asset_title: asset?.title || "Unknown Asset",
          buyer_email: buyerEmail,
          buyer_name: profile?.display_name || buyerEmail.split("@")[0], // Fallback to email username
          purchase_price: sale.purchase_price,
        };
      })
    );

    const totalEarnings =
      sales?.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0;
    const totalSales = sales?.length || 0;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth =
      sales
        ?.filter((sale) => new Date(sale.purchased_at) >= firstDayOfMonth)
        .reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0;

    // ── Royalty income ──────────────────────────────────────────────────────
    // The 3% this user earns as the ORIGINAL creator when a downstream resale
    // of their Commercial-locked asset sells.
    const { data: royaltyRows } = await supabaseAdmin
      .from("royalty_payouts")
      .select("*")
      .eq("original_creator_id", user.id);

    const royalties = await Promise.all(
      (royaltyRows || []).map(async (r) => {
        const { data: asset } = await supabaseAdmin
          .from("assets")
          .select("title")
          .eq("id", r.asset_id)
          .single();
        const { data: sellerProfile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", r.seller_id)
          .single();
        return {
          id: r.id,
          created_at: r.created_at || null,
          asset_title: asset?.title || "Unknown Asset",
          seller_name: sellerProfile?.display_name || "A reseller",
          sale_price_cents: r.sale_price_cents || 0,
          royalty_cents: r.royalty_cents || 0,
          status: r.status || "pending",
        };
      })
    );

    royalties.sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

    const totalRoyalties = royalties.reduce(
      (sum, r) => sum + r.royalty_cents,
      0
    );
    const royaltyThisMonth = royalties
      .filter((r) => r.created_at && new Date(r.created_at) >= firstDayOfMonth)
      .reduce((sum, r) => sum + r.royalty_cents, 0);
    const royaltyPending = royalties
      .filter((r) => r.status !== "paid")
      .reduce((sum, r) => sum + r.royalty_cents, 0);

    const royaltyPercent = await getRoyaltyPercent();

    return NextResponse.json({
      stats: {
        totalEarnings,
        totalSales,
        thisMonth,
        totalRoyalties,
        royaltyThisMonth,
        royaltyPending,
      },
      transactions,
      royalties,
      royaltyPercent,
    });
  } catch (err: any) {
    console.error("Earnings API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
