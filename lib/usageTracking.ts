import { supabase } from "@/lib/supabaseClient";

export async function trackDownload(userId: string) {
  return incrementUsage(userId, "downloads_count");
}

export async function trackUpload(userId: string) {
  return incrementUsage(userId, "uploads_count");
}

export async function trackAIGeneration(userId: string) {
  return incrementUsage(userId, "ai_generations_count");
}

async function incrementUsage(
  userId: string,
  field: "downloads_count" | "uploads_count" | "ai_generations_count"
) {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const periodStartStr = periodStart.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("user_usage")
      .select("*")
      .eq("user_id", userId)
      .eq("period_start", periodStartStr)
      .single();

    if (existing) {
      await supabase
        .from("user_usage")
        .update({
          [field]: (existing[field] || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("user_usage").insert({
        user_id: userId,
        period_start: periodStartStr,
        period_end: periodEndStr,
        [field]: 1,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error tracking usage:", error);
    return { success: false, error };
  }
}
