"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

function calcAgeFromDob(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Latest allowed DOB = 18 years ago today. Used to cap the date picker.
const MIN_AGE = 18;
const MAX_DOB = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE);
  return d.toISOString().split("T")[0];
})();

export default function CompleteProfilePage() {
  const router = useRouter();
  const [dob, setDob] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      // If already has date of birth, go home
      const { data: profile } = await supabase
        .from("profiles")
        .select("date_of_birth")
        .eq("id", session.user.id)
        .single();
      if (profile?.date_of_birth) {
        router.push("/");
        return;
      }
      setChecking(false);
    };
    check();
  }, []);

  const handleSubmit = async () => {
    setError("");

    if (!dob) {
      setError("Date of birth is required");
      return;
    }
    const ageNum = calcAgeFromDob(dob);
    if (ageNum === null) {
      setError("Please enter a valid date of birth");
      return;
    }
    if (ageNum < MIN_AGE) {
      setError(`You must be at least ${MIN_AGE} years old to use Kaizora. Your account has been removed.`);
      setIsLoading(true);
      // Under 16 not allowed
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }
    if (!agreedToTerms) {
      setError("You must agree to the Terms & Conditions to continue");
      return;
    }

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      const u = session.user;
      // Upsert (create-or-update) so it works whether or not the row exists yet.
      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: u.id,
            date_of_birth: u.user_metadata?.date_of_birth || dob,
            display_name: u.user_metadata?.full_name || u.email,
            avatar_url: u.user_metadata?.avatar_url || "",
            bio: u.user_metadata?.bio || null,
            twitter_url: u.user_metadata?.twitter_url || null,
            linkedin_url: u.user_metadata?.linkedin_url || null,
            website_url: u.user_metadata?.website_url || null,
            role: "user",
          },
          { onConflict: "id" },
        );

      if (updateError) {
        setError(updateError.message || "Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      router.push("/");
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm font-light animate-pulse">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center py-3">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="relative w-full max-w-md px-3 md:px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 md:p-10">
          <div className="text-center mb-5 md:mb-8">
            <h1 className="text-xl md:text-2xl font-extralight mb-2 tracking-tight">
              One Last Step
            </h1>
            <p className="text-xs text-gray-500 font-light">
              We need a couple more details before you get started
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 md:p-4 bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm font-light">{error}</p>
            </div>
          )}

          <div className="space-y-4 md:space-y-5">
            <div>
              <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 md:mb-3 uppercase tracking-wider">
                Date of Birth
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => { setDob(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                max={MAX_DOB}
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs md:text-sm font-light"
                disabled={isLoading}
              />
              <p className="mt-2 text-xs text-gray-700 font-light">
                Must be 18 or older to use Kaizora
              </p>
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                disabled={isLoading}
                className={`mt-0.5 w-4 h-4 shrink-0 border transition-colors duration-200 flex items-center justify-center cursor-pointer ${
                  agreedToTerms
                    ? "bg-red-600 border-red-600"
                    : "bg-transparent border-white/20 hover:border-white/40"
                }`}
              >
                {agreedToTerms && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <p className="text-xs text-gray-500 font-light leading-relaxed">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-red-400 hover:text-red-300 transition-colors">
                  Terms & Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-red-400 hover:text-red-300 transition-colors">
                  Privacy Policy
                </Link>
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full bg-linear-to-r from-red-600 to-red-700 text-white font-light py-2 md:py-3 text-xs md:text-sm transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? "Saving..." : "Continue to Kaizora"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
