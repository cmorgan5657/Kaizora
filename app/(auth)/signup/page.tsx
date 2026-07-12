"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Eye, EyeOff, ChevronDown } from "lucide-react";

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

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    date_of_birth: "",
    bio: "",
    twitter_url: "",
    linkedin_url: "",
    website_url: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  React.useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { router.push("/"); router.refresh(); }
    };
    checkUser();
  }, []);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateForm = () => {
    if (!formData.name.trim()) { setError("Name is required"); return false; }
    if (!formData.email.trim()) { setError("Email is required"); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setError("Please enter a valid email"); return false; }
    if (formData.password.length < 6) { setError("Password must be at least 6 characters"); return false; }
    if (formData.password !== formData.confirmPassword) { setError("Passwords do not match"); return false; }
    if (!formData.date_of_birth) { setError("Date of birth is required"); return false; }
    const age = calcAgeFromDob(formData.date_of_birth);
    if (age === null) { setError("Please enter a valid date of birth"); return false; }
    if (age < MIN_AGE) { setError(`You must be at least ${MIN_AGE} years old to create an account`); return false; }
    if (!agreedToTerms) { setError("You must agree to the Terms & Conditions to continue"); return false; }
    return true;
  };

  const handleSignup = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    setError("");

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name,
            date_of_birth: formData.date_of_birth,
            bio: formData.bio || null,
            twitter_url: formData.twitter_url || null,
            linkedin_url: formData.linkedin_url || null,
            website_url: formData.website_url || null,
          },
        },
      });

      if (signUpError) { setError(signUpError.message); setIsLoading(false); return; }
      if (!data.user) { setError("Signup failed. Please try again."); setIsLoading(false); return; }
      if (data.user.identities && data.user.identities.length === 0) {
        setError("This email is already registered. Please sign in instead.");
        setIsLoading(false);
        return;
      }

      router.push("/login?registered=true");
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSignup();
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

  const dobAge = calcAgeFromDob(formData.date_of_birth);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center py-3">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative w-full max-w-md px-3 md:px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 md:p-10">
          <div className="text-center mb-5 md:mb-8">
            <h1 className="text-xl md:text-3xl font-extralight mb-2 tracking-tight">Create Account</h1>
          </div>

          {error && (
            <div className="mb-3 md:mb-5 p-2 md:p-4 bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm font-light">{error}</p>
            </div>
          )}

          <div className="space-y-3 md:space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value.replace(/\b\w/g, (c) => c.toUpperCase()))}
                onKeyPress={handleKeyPress}
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs md:text-sm font-light"
                placeholder="John Doe"
                disabled={isLoading}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs md:text-sm font-light"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 pr-12 text-xs md:text-sm font-light"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors">
                  <div className="relative w-4 h-4">
                    <Eye className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${showPassword ? "opacity-0 scale-75" : "opacity-100 scale-100"}`} />
                    <EyeOff className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${showPassword ? "opacity-100 scale-100" : "opacity-0 scale-75"}`} />
                  </div>
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-gray-700 font-light">Must be at least 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange("confirmPassword", e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 pr-12 text-xs md:text-sm font-light"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors">
                  <div className="relative w-4 h-4">
                    <Eye className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${showConfirmPassword ? "opacity-0 scale-75" : "opacity-100 scale-100"}`} />
                    <EyeOff className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${showConfirmPassword ? "opacity-100 scale-100" : "opacity-0 scale-75"}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] md:text-xs font-light text-gray-500 uppercase tracking-wider">
                  Date of Birth
                </label>
                {dobAge !== null && (
                  <span className="text-[10px] text-gray-500 font-light">
                    Age: <span className="text-white">{dobAge}</span>
                  </span>
                )}
              </div>
              <input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => handleChange("date_of_birth", e.target.value)}
                max={MAX_DOB}
                className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white text-xs md:text-sm font-light [color-scheme:dark]"
                disabled={isLoading}
              />
              <p className="mt-1.5 text-[10px] text-gray-700 font-light">Must be 18 or older · Cannot be changed after signup</p>
            </div>

            {/* Optional fields toggle */}
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="w-full flex items-center justify-between py-2 text-[10px] md:text-xs text-gray-500 hover:text-gray-300 transition-colors duration-200 font-light border-t border-white/5 pt-3"
            >
              <span>Optional — bio &amp; social links</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showOptional ? "rotate-180" : ""}`} />
            </button>

            {showOptional && (
              <div className="space-y-3 pt-1">
                {/* Bio */}
                <div>
                  <label className="block text-[10px] md:text-xs font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                    Bio
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
                    rows={3}
                    className="w-full px-3 md:px-4 py-2 md:py-3 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs md:text-sm font-light resize-none"
                    placeholder="Tell people a bit about yourself..."
                    disabled={isLoading}
                  />
                </div>

                {/* Twitter + LinkedIn */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                      Twitter
                    </label>
                    <input
                      type="url"
                      value={formData.twitter_url}
                      onChange={(e) => handleChange("twitter_url", e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs font-light"
                      placeholder="https://x.com/..."
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                      LinkedIn
                    </label>
                    <input
                      type="url"
                      value={formData.linkedin_url}
                      onChange={(e) => handleChange("linkedin_url", e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs font-light"
                      placeholder="https://linkedin.com/..."
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-[10px] font-light text-gray-500 mb-1.5 uppercase tracking-wider">
                    Website
                  </label>
                  <input
                    type="url"
                    value={formData.website_url}
                    onChange={(e) => handleChange("website_url", e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 focus:outline-none focus:border-white/20 transition-colors duration-300 text-white placeholder-gray-600 text-xs font-light"
                    placeholder="https://yourwebsite.com"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            {/* Terms */}
            <div className="flex items-start gap-3 pt-1">
              <button
                type="button"
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                disabled={isLoading}
                className={`mt-0.5 w-4 h-4 shrink-0 border transition-colors duration-200 flex items-center justify-center cursor-pointer ${
                  agreedToTerms ? "bg-red-600 border-red-600" : "bg-transparent border-white/20 hover:border-white/40"
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
                <Link href="/terms" target="_blank" className="text-red-400 hover:text-red-300 transition-colors">Terms & Conditions</Link>
                {" "}and{" "}
                <Link href="/privacy" target="_blank" className="text-red-400 hover:text-red-300 transition-colors">Privacy Policy</Link>
              </p>
            </div>

            <button
              onClick={handleSignup}
              disabled={isLoading}
              className="w-full bg-linear-to-r from-red-600 to-red-700 text-white font-light py-2 md:py-3 text-xs md:text-sm transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? "Creating Account..." : "Sign Up"}
            </button>
          </div>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-600">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2 md:gap-3 py-2 md:py-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-xs md:text-sm font-light text-white relative h-10 md:h-14"
          >
            <div className={`flex items-center gap-3 transition-all duration-250 ${googleLoading ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </div>
            <div className={`absolute flex items-center overflow-hidden transition-all duration-500 ${googleLoading ? "w-24 opacity-100" : "w-0 opacity-0"}`}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", margin: "0 5px", flexShrink: 0, transform: googleLoading ? "scale(1)" : "scale(0)", transition: `transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 80}ms`, animation: googleLoading ? `colorCycle 0.8s ease-in-out infinite ${i * 0.2}s` : "none" }} />
              ))}
            </div>
          </button>

          <button
            onClick={handleAppleLogin}
            disabled={appleLoading}
            className="w-full flex items-center justify-center gap-2 md:gap-3 py-2 md:py-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-xs md:text-sm font-light text-white relative h-10 md:h-12 mt-2"
          >
            <svg className={`w-4 h-4 ${appleLoading ? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : "relative"}`} viewBox="0 0 24 24" style={{ animation: appleLoading ? "blinkFill 0.8s ease-in-out infinite" : "none" }}>
              <path fill="white" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83" />
              <path fill="white" style={{ animation: appleLoading ? "blinkFill 0.8s ease-in-out infinite 0.15s" : "none" }} d="M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span style={{ opacity: appleLoading ? 0 : 1, transform: appleLoading ? "translateX(30px)" : "translateX(0px)", transition: "opacity 0.4s ease, transform 0.4s ease", display: "inline-block" }}>
              Continue with Apple
            </span>
          </button>

          <div className="mt-4 md:mt-6 text-center text-[10px] md:text-xs font-light">
            <span className="text-gray-600">Already have an account? </span>
            <Link href="/login" className="text-red-400 hover:text-red-300 transition-colors">Sign in</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
