"use client";

import { supabase } from "@/lib/supabaseClient";

type SupabaseLikeError = {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
};

const AUTH_FAILURE_PATTERNS = [
  "jwt",
  "forbidden",
  "unauthorized",
  "session",
  "refresh token",
  "auth",
];

export function isClientAuthFailure(error: SupabaseLikeError | null | undefined) {
  if (!error) return false;
  if (error.status === 401 || error.status === 403) return true;

  const haystack = `${error.code || ""} ${error.name || ""} ${error.message || ""}`
    .toLowerCase()
    .trim();

  return AUTH_FAILURE_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export async function handleClientAuthFailure(
  error: SupabaseLikeError | null | undefined,
  redirectTo = "/login?error=session-expired",
) {
  if (!isClientAuthFailure(error)) return false;

  try {
    await supabase.auth.signOut();
  } catch {}

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = redirectTo;
  }

  return true;
}
