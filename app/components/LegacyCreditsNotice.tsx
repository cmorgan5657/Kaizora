"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/**
 * One-time apology banner shown only to users whose pre-existing credits were
 * flushed when the expiry policy was introduced (user_credits.legacy_flushed_at).
 * Dismissible — stays hidden afterwards via localStorage.
 */
export default function LegacyCreditsNotice() {
  const [flushedAt, setFlushedAt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("user_credits")
        .select("legacy_flushed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const ts = (data as any)?.legacy_flushed_at ?? null;
      if (!ts) return;

      const key = `legacy_credits_notice_${user.id}`;
      if (localStorage.getItem(key) === ts) {
        setDismissed(true);
        return;
      }
      setFlushedAt(ts);
    })();
  }, []);

  if (!flushedAt || dismissed) return null;

  // Synchronous — hide instantly, then persist so it stays hidden on reload.
  const dismiss = () => {
    setDismissed(true);
    try {
      if (userId) {
        localStorage.setItem(`legacy_credits_notice_${userId}`, flushedAt);
      }
    } catch {
      // localStorage unavailable — banner still hides for this session.
    }
  };

  return (
    <div className="flex items-start gap-2 p-3 mb-4 border border-amber-500/30 bg-amber-500/10">
      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
      <p className="flex-1 text-[10px] md:text-xs text-amber-200/90 leading-relaxed">
        We&apos;ve introduced a credit expiry policy, so your previous credits
        have expired. We&apos;re sincerely sorry for the inconvenience — thank you
        for your understanding.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="text-amber-400/70 hover:text-amber-300 transition-colors cursor-pointer shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
