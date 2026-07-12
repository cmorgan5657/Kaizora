import { supabase } from "@/lib/supabaseClient";

export async function syncSubscriptionCredits() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) return;

  try {
    await fetch("/api/credits/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // Best-effort only.
  }
}
