"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";

export async function signInWithPassword(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Single source of truth for first-login provisioning (idempotent).
  const { slug } = await getOrProvisionWorkspace({
    id: data.user.id,
    email: data.user.email,
    fullName:
      (data.user.user_metadata?.full_name as string | undefined) ?? null,
  });

  redirect(`/${slug}`);
}
