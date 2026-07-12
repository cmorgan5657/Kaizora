"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { handleClientAuthFailure } from "@/lib/clientAuthFailure";

export default function BanGuard() {
  useEffect(() => {
    async function checkBan() {
      const { data, error: authError } = await supabase.auth.getUser();
      if (await handleClientAuthFailure(authError)) return;
      if (!data.user) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_banned")
        .eq("id", data.user.id)
        .single();
      if (await handleClientAuthFailure(profileError)) return;

      if (profile?.is_banned) {
        await supabase.auth.signOut();
        window.location.href = "/login?error=suspended";
      }
    }

    checkBan();

    // Also check on auth state changes (e.g. OAuth callback)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          checkBan();
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
