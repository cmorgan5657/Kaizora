"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { SUPERADMIN_EMAIL } from "@/lib/superadmin";
import { setBetaEmailCookie } from "@/lib/betaAccess";
function ForgotPasswordForm({
  setMode,
}: {
  setMode: (value: "login") => void;
}) {
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const handleReset = async () => {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("A reset link has been sent to your email.");
    }

    setLoading(false);
  };

  return (
    <div className="space-y-3 md:space-y-5 p-5 md:p-10 bg-white/5 backdrop-blur-xl border border-white/10">
      <h2 className="text-lg md:text-2xl font-extralight text-center mb-4 md:mb-8">
        Reset Password
      </h2>

      {message && (
        <div className="p-3 bg-red-500/10 text-red-300 border border-red-500/20 text-sm">
          {message}
        </div>
      )}

      <div>
        <label className="block text-[10px] md:text-xs text-gray-500 mb-1.5 md:mb-3">Email</label>
        <input
          type="email"
          className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 text-xs md:text-sm text-white"
          placeholder="Enter E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      <button
        onClick={handleReset}
        disabled={loading}
        className="w-full bg-linear-to-r from-red-600 cursor-pointer to-red-700 py-2 md:py-3 text-xs md:text-sm text-white"
      >
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
      <button
        onClick={() => setMode("login")}
        className="w-full text-gray-400 cursor-pointer hover:text-gray-200 text-sm mt-4"
      >
        Back to Login
      </button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  React.useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setBetaEmailCookie(session.user.email);
        router.push("/");
        router.refresh();
      }
    };

    checkUser();

    // Pre-fill saved email if remember me was previously checked
    const savedEmail = localStorage.getItem("kz_remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    // Check if redirected from ban
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "suspended") {
      setError("Your account has been suspended. Contact support for help.");
    }
    if (params.get("error") === "session-expired") {
      setError("Your session expired. Please log in again.");
    }
    if (params.get("registered") === "true") {
      setMessage("Signup request received. Please confirm your email before logging in.");
    }
  }, []);

  const handleLogin = async () => {
    setError("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else if (data.session) {
        const profileBase = await supabase
          .from("profiles")
          .select("id, date_of_birth, is_banned")
          .eq("id", data.session.user.id)
          .single();

        // Check if user is banned
        const profile = profileBase.data;

        if (profile?.is_banned) {
          await supabase.auth.signOut();
          setError("Your account has been suspended. Contact support for help.");
          setIsLoading(false);
          return;
        }

        const userEmail = data.session.user.email;
        setBetaEmailCookie(userEmail);

        // Remember me logic
        if (rememberMe) {
          // Save email for next visit.
          localStorage.setItem("kz_remembered_email", userEmail || "");
        } else {
          localStorage.removeItem("kz_remembered_email");
        }

        if (userEmail === SUPERADMIN_EMAIL) {
          router.push("/superadmin");
          return;
        }

        const metadataDob = data.session.user.user_metadata?.date_of_birth;

        if (!profile?.id || !profile.date_of_birth) {
          if (metadataDob) {
            const { error: profileUpsertError } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: data.session.user.id,
                  date_of_birth: metadataDob,
                  display_name:
                    data.session.user.user_metadata?.full_name || userEmail,
                  avatar_url:
                    data.session.user.user_metadata?.avatar_url || "",
                  bio: data.session.user.user_metadata?.bio || null,
                  twitter_url:
                    data.session.user.user_metadata?.twitter_url || null,
                  linkedin_url:
                    data.session.user.user_metadata?.linkedin_url || null,
                  website_url:
                    data.session.user.user_metadata?.website_url || null,
                  role: "user",
                },
                { onConflict: "id" },
              );

            if (profileUpsertError) {
              setError(
                profileUpsertError.message ||
                  "We could not finish setting up your profile.",
              );
              setIsLoading(false);
              return;
            }
          } else {
            router.push("/complete-profile");
            return;
          }
        }

        const params = new URLSearchParams(window.location.search);

        const fromLogout = params.get("fromLogout") === "true";

        if (fromLogout) {
          router.push("/");
          return;
        }

        const redirectTo = params.get("redirectTo") || "/";
        router.push(redirectTo);

        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  };

const handleAppleLogin = async () => {
  setAppleLoading(true);
  await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: `${window.location.origin}/callback` },
  });
};


  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
      </div>

      <div className="relative w-full max-w-md px-3 md:px-6">
        <div className="relative min-h-[480px]">
          {/* LOGIN VIEW */}
          <div
            className={`absolute inset-0 transition-all duration-500 ${
              mode === "login"
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-10 pointer-events-none"
            }`}
          >
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 md:p-10">
              {/* Header */}
              <div className="text-center mb-5 md:mb-10">
                <h1 className="text-xl md:text-3xl font-extralight mb-2 tracking-tight">
                  Welcome Back
                </h1>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-3 md:mb-6 p-2 md:p-4 bg-red-500/10 border border-red-500/30">
                  <p className="text-red-400 text-sm font-light">{error}</p>
                </div>
              )}

              {message && (
                <div className="mb-3 md:mb-6 p-2 md:p-4 bg-green-500/10 border border-green-500/30">
                  <p className="text-green-300 text-sm font-light">{message}</p>
                </div>
              )}

              {/* Login Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
                autoComplete="on"
                className="space-y-3 md:space-y-5"
              >
                <div>
                  <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 md:mb-3 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs md:text-sm font-light"
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 md:mb-3 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 pr-12 text-xs md:text-sm font-light"
                      placeholder="••••••••"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      <div className="relative w-4 h-4">
                        <Eye className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${showPassword ? "opacity-0 scale-75" : "opacity-100 scale-100"}`} />
                        <EyeOff className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${showPassword ? "opacity-100 scale-100" : "opacity-0 scale-75"}`} />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-light">
                  <button
                    type="button"
                    onClick={() => setRememberMe((v) => !v)}
                    className="flex items-center gap-2.5 cursor-pointer group"
                  >
                    <div className={`w-4 h-4 shrink-0 border flex items-center justify-center transition-colors duration-200 ${rememberMe ? "bg-red-600 border-red-600" : "bg-transparent border-white/20 group-hover:border-white/40"}`}>
                      {rememberMe && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-gray-600 group-hover:text-gray-400 transition-colors">
                      Remember me
                    </span>
                  </button>
                  <button
                    onClick={() => setMode("forgot")}
                    className="text-red-400 hover:text-red-300 cursor-pointer transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-linear-to-r from-red-600 to-red-700 text-white font-light py-2 md:py-3 cursor-pointer text-xs md:text-sm transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isLoading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-gray-600">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-2 md:gap-3 py-2 md:py-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-xs md:text-sm font-light text-white relative h-10 md:h-14"
              >
                <div
                  className={`flex items-center gap-3 transition-all duration-250 ${googleLoading ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </div>

                <div
                  className={`absolute flex items-center overflow-hidden transition-all duration-500 ${googleLoading ? "w-24 opacity-100" : "w-0 opacity-0"}`}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        margin: "0 5px",
                        flexShrink: 0,
                        transform: googleLoading ? "scale(1)" : "scale(0)",
                        transition: `transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 80}ms`,
                        animation: googleLoading
                          ? `colorCycle 0.8s ease-in-out infinite ${i * 0.2}s`
                          : "none",
                      }}
                    />
                  ))}
                </div>
              </button>
        <button
  onClick={handleAppleLogin}
  disabled={appleLoading}
  className="w-full flex items-center justify-center gap-2 md:gap-3 py-2 md:py-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-xs md:text-sm font-light text-white relative h-10 md:h-12"
>
  <svg
    className={`w-4 h-4 ${appleLoading ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'relative'}`}
    viewBox="0 0 24 24"
    style={{ animation: appleLoading ? 'blinkFill 0.8s ease-in-out infinite' : 'none' }}
  >
    <path fill="white" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83"/>
    <path fill="white" style={{ animation: appleLoading ? 'blinkFill 0.8s ease-in-out infinite 0.15s' : 'none' }} d="M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
  <span style={{
    opacity: appleLoading ? 0 : 1,
    transform: appleLoading ? 'translateX(30px)' : 'translateX(0px)',
    transition: 'opacity 0.4s ease, transform 0.4s ease',
    display: 'inline-block'
  }}>
    Continue with Apple
  </span>
</button>
              {/* Sign Up Link */}
              <div className="mt-4 md:mt-8 text-center text-[10px] md:text-xs font-light">
                <span className="text-gray-600">Don't have an account? </span>
                <Link
                  href="/signup"
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  Sign up
                </Link>
              </div>
            </div>
          </div>

          {/* FORGOT PASSWORD VIEW */}
          <div
            className={`absolute inset-0 transition-all duration-500 ${
              mode === "forgot"
                ? "opacity-100 translate-x-0"
                : "opacity-0 translate-x-10 pointer-events-none"
            }`}
          >
            <ForgotPasswordForm setMode={setMode} />
          </div>
        </div>
      </div>
    </main>
  );
}
