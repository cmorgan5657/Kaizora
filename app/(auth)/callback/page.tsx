"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { setBetaEmailCookie } from "@/lib/betaAccess";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    let done = false;

    const proceed = async (session: any) => {
      if (done) return;
      done = true;

      const user = session.user;
      const metadataDob = user.user_metadata?.date_of_birth || null;
      setBetaEmailCookie(user.email);

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, date_of_birth")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        await supabase.from("profiles").upsert({
          id: user.id,
          date_of_birth: metadataDob,
          display_name: user.user_metadata?.full_name || user.email,
          avatar_url: user.user_metadata?.avatar_url || "",
          bio: user.user_metadata?.bio || null,
          twitter_url: user.user_metadata?.twitter_url || null,
          linkedin_url: user.user_metadata?.linkedin_url || null,
          website_url: user.user_metadata?.website_url || null,
          role: "user",
        }, { onConflict: "id" });
        router.push(metadataDob ? "/" : "/complete-profile");
        return;
      }

      if (!existingProfile.date_of_birth) {
        if (metadataDob) {
          await supabase
            .from("profiles")
            .upsert(
              {
                id: user.id,
                date_of_birth: metadataDob,
                display_name: user.user_metadata?.full_name || user.email,
                avatar_url: user.user_metadata?.avatar_url || "",
                bio: user.user_metadata?.bio || null,
                twitter_url: user.user_metadata?.twitter_url || null,
                linkedin_url: user.user_metadata?.linkedin_url || null,
                website_url: user.user_metadata?.website_url || null,
                role: "user",
              },
              { onConflict: "id" },
            );
          router.push("/");
          return;
        }
        router.push("/complete-profile");
        return;
      }

      router.push("/");
    };

    // Fires SIGNED_IN once the OAuth code in the URL is exchanged for a session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) proceed(session);
    });

    // In case the exchange already finished before this listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) proceed(data.session);
    });

    // Fallback: if no session appears, send back to login instead of hanging/looping home.
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        router.push("/login");
      }
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-gray-400 text-sm font-light animate-pulse">
        Signing you in...
      </p>
    </main>
  );
}
