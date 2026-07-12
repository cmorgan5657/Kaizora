import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function usePlanFeatures() {
  const [features, setFeatures] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeatures();
  }, []);

  async function loadFeatures() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select(
          `
        status,
        subscription_plans!plan_id (
          name,
          slug,
          plan_features (*)
        )
      `
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      const periodStart = new Date();
      periodStart.setDate(1);
      const periodStartStr = periodStart.toISOString().split("T")[0];

      const { data: usage } = await supabase
        .from("user_usage")
        .select("*")
        .eq("user_id", user.id)
        .eq("period_start", periodStartStr)
        .single();

      const plan = Array.isArray(sub?.subscription_plans)
        ? sub.subscription_plans[0]
        : sub?.subscription_plans;

      // FIX: Extract plan_features correctly
      const feat = Array.isArray(plan?.plan_features)
        ? plan.plan_features[0]
        : plan?.plan_features;

      setFeatures({
        can_upload_assets: feat?.can_upload_assets ?? false,
        can_download_assets: feat?.can_download_assets ?? false,
        can_use_transform: feat?.can_use_transform ?? false,
        can_use_ai_regeneration: feat?.can_use_ai_regeneration ?? false,
        can_list_marketplace: feat?.can_list_marketplace ?? false,
        can_view_analytics: feat?.can_view_analytics ?? false,
        can_access_community: feat?.can_access_community ?? false,
        max_downloads_per_month: feat?.max_downloads_per_month ?? null,
        max_uploads_per_month: feat?.max_uploads_per_month ?? null,
        max_ai_generations_per_month:
          feat?.max_ai_generations_per_month ?? null,
        current_downloads: usage?.downloads_count ?? 0,
        current_uploads: usage?.uploads_count ?? 0,
        current_ai_generations: usage?.ai_generations_count ?? 0,
        plan_name: plan?.name ?? "No Plan",
      });

      setLoading(false);
    } catch (error) {
      console.error("Error loading features:", error);
      setLoading(false);
    }
  }

  const canDownload = () => {
    if (!features?.can_download_assets) return false;
    if (features.max_downloads_per_month === null) return true;
    return features.current_downloads < features.max_downloads_per_month;
  };

  const canUpload = () => {
    if (!features?.can_upload_assets) return false;
    if (features.max_uploads_per_month === null) return true;
    return features.current_uploads < features.max_uploads_per_month;
  };

  const canUseAI = () => {
    if (!features?.can_use_ai_regeneration) return false;
    if (features.max_ai_generations_per_month === null) return true;
    return (
      features.current_ai_generations < features.max_ai_generations_per_month
    );
  };

  return {
    features,
    loading,
    canDownload,
    canUpload,
    canUseAI,
    refresh: loadFeatures,
  };
}
