import { supabase } from "./supabase";

export async function getCurrentUserProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      profile: null,
      error: userError?.message || "No user logged in",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, store_id, is_active")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return { user, profile: null, error: profileError.message };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { user: null, profile: null, error: "ACCOUNT_DISABLED" };
  }

  return { user, profile, error: null };
}
