"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getFallbackCreditCost } from "@/lib/creditPricing";
import { syncSubscriptionCredits } from "@/lib/syncSubscriptionCredits";
import { getCreditBuckets } from "@/lib/creditBuckets";
import { isSuperadminEmail, isSuperadminRole } from "@/lib/superadmin";

/**
 * Live credit balance for the logged-in user.
 * Returns null while loading or when logged out, otherwise the balance.
 * Stays in sync via realtime + the global "credits-updated" window event.
 */
export function useCreditBalance(): number | null {
  const [balance, setBalance] = useState<number | null>(null);
  const channelId = useRef(`credit-balance-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setBalance(null);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (isSuperadminRole(profile?.role) || isSuperadminEmail(user.email)) {
        if (active) setBalance(null);
        return;
      }

      await syncSubscriptionCredits();
      const { data } = await supabase
        .from("user_credits")
        .select("balance, subscription_credits, purchased_credits")
        .eq("user_id", user.id)
        .maybeSingle();
      if (active) setBalance(getCreditBuckets(data).totalBalance);
    };

    load();

    const channel = supabase
      .channel(channelId.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits" },
        load,
      )
      .subscribe();

    const onUpdated = () => load();
    window.addEventListener("credits-updated", onUpdated);

    return () => {
      active = false;
      channel.unsubscribe();
      window.removeEventListener("credits-updated", onUpdated);
    };
  }, []);

  return balance;
}

/**
 * Credit cost for an action key (from credit_action_costs).
 * Returns null while loading / when actionKey is null.
 */
export function useActionCost(actionKey: string | null): number | null {
  const [cost, setCost] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!actionKey) {
      setCost(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("credit_action_costs")
        .select("credits")
        .eq("action", actionKey)
        .maybeSingle();
      if (active) {
        setCost(data?.credits ?? getFallbackCreditCost(actionKey));
      }
    })();
    return () => {
      active = false;
    };
  }, [actionKey]);

  return cost;
}
