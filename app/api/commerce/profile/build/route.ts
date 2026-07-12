import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { runCommerceIntake } from "@/lib/ai/commerceIntake";
import { buildProfileFromDecision } from "@/lib/commerce/buildProfileFromDecision";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    console.log("[profile/build] token present:", !!token);

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    console.log("[profile/build] auth result:", { userId: userData?.user?.id, authError: authError?.message });

    if (authError || !userData?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { asset_id, entry_point } = body;

    console.log("[profile/build] body:", { asset_id, entry_point });

    if (!asset_id) {
      return NextResponse.json(
        { error: "asset_id is required" },
        { status: 400 },
      );
    }

    // Check if profile already exists
    const { data: existing } = await supabaseAdmin
      .from("asset_commerce_profiles")
      .select("id")
      .eq("asset_id", asset_id)
      .maybeSingle();

    console.log("[profile/build] existing profile:", existing);

    // Fetch the asset
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    console.log("[profile/build] asset query result:", { asset: asset?.id, assetError: assetError?.message, assetErrorDetails: assetError });

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found", details: assetError }, { status: 404 });
    }

    console.log("[profile/build] asset owner_id:", asset.owner_id, "userId:", userId);

    if (asset.owner_id !== userId) {
      return NextResponse.json({ error: "Not your asset" }, { status: 403 });
    }

    const source = entry_point || "marketplace_direct";

    // Path 1: Decision Layer exists — hydrate from decision data
    if (source === "decision_layer") {
      const { data: decisionData } = await supabaseAdmin
        .from("agent_decisions")
        .select("id, input, output, explanation")
        .eq("asset_id", asset_id)
        .eq("agent_type", "decision_layer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (decisionData) {
        const output = decisionData.output as any;
        const evaluation = {
          decision: output?.decision || "not-yet",
          overallReadiness: output?.overallReadiness ?? 50,
          readinessScores: output?.readinessScores || [],
          alignmentVerdict: output?.alignmentVerdict || "hold-as-exploration",
          pricingGuidance: output?.pricingGuidance,
          contentCritique: output?.contentCritique,
          honestAssessment: output?.honestAssessment || asset.description,
          KAIZORAStrategy: output?.KAIZORAStrategy,
          marketReality: output?.marketReality,
        };

        const profile = await buildProfileFromDecision(
          asset_id,
          userId,
          evaluation,
          { title: asset.title, description: asset.description, category: asset.category, tags: asset.tags },
        );

        return NextResponse.json({ success: true, profile, source: "decision_layer" });
      }
      // If no decision data found, fall through to marketplace intake
    }

    // Fetch distinct existing categories from public assets so AI picks from real ones
    const { data: catRows } = await supabaseAdmin
      .from("assets")
      .select("category")
      .eq("is_public", true)
      .not("category", "is", null)
      .limit(2000);
    const existingCategories = Array.from(
      new Set(
        (catRows || [])
          .map((r: any) => (r.category || "").trim())
          .filter((c: string) => c.length > 0),
      ),
    );

    // Path 2: Marketplace Direct — run lightweight intake agent
    const intakeResult = await runCommerceIntake({
      title: asset.title,
      description: asset.description,
      category: asset.category,
      tags: asset.tags,
      file_type: asset.content_type,
      price_cents: asset.price_cents,
      existing_categories: existingCategories,
    });

    if (!intakeResult) {
      return NextResponse.json(
        { error: "Commerce intake analysis failed" },
        { status: 500 },
      );
    }

    const profile = {
      asset_id,
      user_id: userId,
      source_path: "marketplace_direct",
      decision_id: null,
      content_description: intakeResult.content_description,
      technical_quality_score: intakeResult.technical_quality_score ?? null,
      market_fit_score: intakeResult.market_fit_score ?? null,
      originality_proxy_score: intakeResult.originality_proxy_score ?? null,
      policy_risk_score: intakeResult.policy_risk_score,
      narrative_potential_score: null,
      repeatability_potential_score: null,
      commerce_readiness_score: intakeResult.commerce_readiness_score,
      listing_readiness_status:
        intakeResult.commerce_readiness_score >= 60 ? "ready" : "needs_work",
      suggested_categories: intakeResult.suggested_categories,
      suggested_product_shapes: intakeResult.suggested_product_shapes,
      suggested_tags: intakeResult.suggested_tags,
      suggested_keywords: intakeResult.suggested_keywords,
      suggested_price_band: intakeResult.suggested_price_band,
      suggested_license_type: intakeResult.suggested_license_type,
      bundle_candidates: [],
      preview_strength: intakeResult.preview_strength,
      thumbnail_notes: intakeResult.thumbnail_notes,
      recommended_next_commerce_action:
        intakeResult.recommended_next_commerce_action,
      profile_confidence: intakeResult.profile_confidence,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabaseAdmin
        .from("asset_commerce_profiles")
        .update(profile)
        .eq("asset_id", asset_id);
    } else {
      await supabaseAdmin
        .from("asset_commerce_profiles")
        .insert(profile);
    }

    return NextResponse.json({
      success: true,
      profile,
      source: "marketplace_direct",
    });
  } catch (error: any) {
    console.error("Commerce profile build error:", error);
    return NextResponse.json(
      { error: "Failed to build commerce profile", details: error.message },
      { status: 500 },
    );
  }
}
