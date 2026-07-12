import { supabase } from "@/lib/supabaseClient";

export async function getAIMode(): Promise<"AUTO" | "SUGGEST"> {
  const { data } = await supabase.from("ai_settings").select("mode").single();

  return data?.mode === "AUTO" ? "AUTO" : "SUGGEST";
}
