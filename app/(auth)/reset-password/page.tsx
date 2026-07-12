"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get("access_token");

    if (accessToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: urlParams.get("refresh_token") || "",
      });
    }
  }, []);

  const handleReset = async () => {
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password updated successfully. You can now sign in.");
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="relative w-full max-w-md px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-10 space-y-6">
          <h1 className="text-3xl font-extralight text-center mb-2">
            Reset Password
          </h1>

          {message && (
            <div className="p-3 bg-purple-500/10 text-purple-300 border border-purple-500/20 text-sm text-center">
              {message}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-3">
              New Password
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-3">
              Confirm Password
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            onClick={handleReset}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 py-3 text-white flex justify-center items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>
    </main>
  );
}
