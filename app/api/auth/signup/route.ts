import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverPublicEnv } from "@/lib/env/public-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";

// When true, new signups are confirmed immediately and signed in — no email
// confirmation step. Set to false (or unset) to require email verification via
// the /auth/callback flow. Controlled by AUTH_AUTOCONFIRM_SIGNUP env var,
// defaulting to ON so signup → instant login works out of the box.
const AUTO_CONFIRM = process.env.AUTH_AUTOCONFIRM_SIGNUP !== "false";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const { supabaseUrl, supabaseAnonKey } = serverPublicEnv();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If a session already exists, email confirmation is off in Supabase and the
    // user is signed in. Otherwise (Supabase requires confirmation) optionally
    // auto-confirm so the user isn't stranded on "check your email".
    let signedIn = Boolean(data.session);

    if (!signedIn && data.user && AUTO_CONFIRM) {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      // Establish a cookie session via the SSR client (writes auth cookies).
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      signedIn = !signInError;
    }

    // If we have a signed-in user, provision their workspace and hand back the
    // slug so the client can go straight to the dashboard.
    let slug: string | null = null;
    if (signedIn && data.user) {
      try {
        const ws = await getOrProvisionWorkspace({
          id: data.user.id,
          email: data.user.email,
          fullName:
            (data.user.user_metadata?.full_name as string | undefined) ?? null,
        });
        slug = ws.slug;
      } catch (wsErr) {
        console.error("signup: workspace provisioning failed", wsErr);
      }
    }

    return NextResponse.json(
      {
        message: signedIn
          ? "Sign up successful."
          : "Sign up successful. Check your email to confirm.",
        user: data.user,
        signedIn,
        slug,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
