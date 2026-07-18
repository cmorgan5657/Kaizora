import { supabaseAdmin } from "@/lib/supabaseServer";
import { isSuperadminEmail, isSuperadminRole } from "@/lib/superadmin";

export async function isSuperadminUserId(
  userId?: string | null,
): Promise<boolean> {
  if (!userId) return false;

  const [{ data: profile }, { data: userData }] = await Promise.all([
    supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);

  return (
    isSuperadminRole(profile?.role) ||
    isSuperadminEmail(userData?.user?.email)
  );
}
