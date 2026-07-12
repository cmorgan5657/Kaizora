import { supabase } from "./supabaseClient";
import { supabaseAdmin } from "./supabaseServer";

/**
 * Get user's plan features and limits
 */
export async function getUserPlanFeatures(userId: string) {
  const { data: subscription } = await supabase
    .from("user_subscriptions")
    .select(
      `
      *,
      subscription_plans!inner (
        *,
        plan_features!inner (*)
      )
    `
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  // Fix: Access nested structure correctly
  const planData = subscription?.subscription_plans as any;
  const featuresArray = planData?.plan_features;

  if (
    !featuresArray ||
    !Array.isArray(featuresArray) ||
    featuresArray.length === 0
  ) {
    // Return free tier defaults
    return {
      can_upload_assets: true,
      can_download_assets: true,
      can_use_transform: true,
      can_use_ai_regeneration: false,
      can_list_marketplace: false,
      can_view_analytics: false,
      has_priority_support: false,
      has_priority_placement: false,
      can_access_community: false,
      max_downloads_per_month: 5,
      max_uploads_per_month: 10,
      max_ai_generations_per_month: 3,
    };
  }

  return featuresArray[0];
}

/**
 * Get user's current month usage
 */
export async function getUserUsage(userId: string) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const { data: usage } = await supabase
    .from("user_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .single();

  if (!usage) {
    return {
      uploads_count: 0,
      downloads_count: 0,
      ai_generations_count: 0,
      storage_used_gb: 0,
    };
  }

  return usage;
}

/**
 * Check if user can perform an action
 */
export async function canUserPerformAction(
  userId: string,
  action: "upload" | "download" | "ai_generation"
): Promise<{ allowed: boolean; reason?: string }> {
  const features = await getUserPlanFeatures(userId);
  const usage = await getUserUsage(userId);

  // Check permission first
  switch (action) {
    case "upload":
      if (!features.can_upload_assets) {
        return { allowed: false, reason: "Your plan doesn't allow uploads" };
      }
      break;
    case "download":
      if (!features.can_download_assets) {
        return { allowed: false, reason: "Your plan doesn't allow downloads" };
      }
      break;
    case "ai_generation":
      if (!features.can_use_ai_regeneration) {
        return {
          allowed: false,
          reason: "Your plan doesn't include AI generation",
        };
      }
      break;
  }

  // Check usage limits
  switch (action) {
    case "upload":
      if (features.max_uploads_per_month === null) {
        return { allowed: true }; // Unlimited
      }
      if (usage.uploads_count >= features.max_uploads_per_month) {
        return {
          allowed: false,
          reason: `Upload limit reached (${features.max_uploads_per_month}/month)`,
        };
      }
      break;

    case "download":
      if (features.max_downloads_per_month === null) {
        return { allowed: true }; // Unlimited
      }
      if (usage.downloads_count >= features.max_downloads_per_month) {
        return {
          allowed: false,
          reason: `Download limit reached (${features.max_downloads_per_month}/month)`,
        };
      }
      break;

    case "ai_generation":
      if (features.max_ai_generations_per_month === null) {
        return { allowed: true }; // Unlimited
      }
      if (usage.ai_generations_count >= features.max_ai_generations_per_month) {
        return {
          allowed: false,
          reason: `AI generation limit reached (${features.max_ai_generations_per_month}/month)`,
        };
      }
      break;
  }

  return { allowed: true };
}

/**
 * Check if user has a specific feature
 */
export async function userHasFeature(
  userId: string,
  feature:
    | "can_upload_assets"
    | "can_download_assets"
    | "can_use_transform"
    | "can_use_ai_regeneration"
    | "can_list_marketplace"
    | "can_view_analytics"
    | "has_priority_support"
    | "has_priority_placement"
    | "can_access_community"
): Promise<boolean> {
  const features = await getUserPlanFeatures(userId);
  return features[feature] || false;
}

/**
 * Increment usage counter
 */
export async function incrementUsage(
  userId: string,
  action: "upload" | "download" | "ai_generation"
) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const field = `${action}s_count`;

  const { data: existing } = await supabase
    .from("user_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .single();

  if (existing) {
    await supabase
      .from("user_usage")
      .update({
        [field]: existing[field] + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_usage").insert({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      [field]: 1,
    });
  }
}

/**
 * Update storage usage
 */
export async function updateStorageUsage(userId: string, storageGb: number) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const { data: existing } = await supabase
    .from("user_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .single();

  if (existing) {
    await supabase
      .from("user_usage")
      .update({
        storage_used_gb: storageGb,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_usage").insert({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      storage_used_gb: storageGb,
    });
  }
}

// ============================================
// SERVER-SIDE VERSIONS (for API routes)
// ============================================

/**
 * SERVER: Check if user can perform an action
 */
export async function canUserPerformActionServer(
  userId: string,
  action: "upload" | "download" | "ai_generation"
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: subscription } = await supabaseAdmin
    .from("user_subscriptions")
    .select(
      `
      subscription_plans!inner (
        id,
        name,
        plan_features!inner (*)
      )
    `
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  // Fix: Access the nested structure correctly
  const planData = subscription?.subscription_plans as any;
  const featuresArray = planData?.plan_features;
  const features =
    Array.isArray(featuresArray) && featuresArray.length > 0
      ? featuresArray[0]
      : {
          can_upload_assets: true,
          can_download_assets: true,
          can_use_ai_regeneration: false,
          max_uploads_per_month: 10,
          max_downloads_per_month: 5,
          max_ai_generations_per_month: 3,
        };

  // Check permission
  switch (action) {
    case "upload":
      if (!features.can_upload_assets) {
        return { allowed: false, reason: "Your plan doesn't allow uploads" };
      }
      break;
    case "download":
      if (!features.can_download_assets) {
        return { allowed: false, reason: "Your plan doesn't allow downloads" };
      }
      break;
    case "ai_generation":
      if (!features.can_use_ai_regeneration) {
        return {
          allowed: false,
          reason: "Your plan doesn't include AI generation",
        };
      }
      break;
  }

  // Check usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const { data: usage } = await supabaseAdmin
    .from("user_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .single();

  const currentUsage = usage || {
    uploads_count: 0,
    downloads_count: 0,
    ai_generations_count: 0,
  };

  switch (action) {
    case "upload":
      if (features.max_uploads_per_month === null) return { allowed: true };
      if (currentUsage.uploads_count >= features.max_uploads_per_month) {
        return { allowed: false, reason: `Upload limit reached` };
      }
      break;
    case "download":
      if (features.max_downloads_per_month === null) return { allowed: true };
      if (currentUsage.downloads_count >= features.max_downloads_per_month) {
        return { allowed: false, reason: `Download limit reached` };
      }
      break;
    case "ai_generation":
      if (features.max_ai_generations_per_month === null)
        return { allowed: true };
      if (
        currentUsage.ai_generations_count >=
        features.max_ai_generations_per_month
      ) {
        return { allowed: false, reason: `AI generation limit reached` };
      }
      break;
  }

  return { allowed: true };
}

/**
 * SERVER: Increment usage counter
 */
export async function incrementUsageServer(
  userId: string,
  action: "upload" | "download" | "ai_generation"
) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const field = `${action}s_count`;

  const { data: existing } = await supabaseAdmin
    .from("user_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .single();

  if (existing) {
    await supabaseAdmin
      .from("user_usage")
      .update({
        [field]: existing[field] + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("user_usage").insert({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      [field]: 1,
    });
  }
}

/**
 * SERVER: Check if user has a specific feature
 */
export async function userHasFeatureServer(
  userId: string,
  feature:
    | "can_upload_assets"
    | "can_download_assets"
    | "can_use_transform"
    | "can_use_ai_regeneration"
    | "can_list_marketplace"
    | "can_view_analytics"
    | "has_priority_support"
    | "has_priority_placement"
    | "can_access_community"
): Promise<boolean> {
  const { data: subscription } = await supabaseAdmin
    .from("user_subscriptions")
    .select(
      `
      subscription_plans!inner (
        plan_features!inner (*)
      )
    `
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  const planData = subscription?.subscription_plans as any;
  const featuresArray = planData?.plan_features;
  const features =
    Array.isArray(featuresArray) && featuresArray.length > 0
      ? featuresArray[0]
      : null;

  return features?.[feature] || false;
}
