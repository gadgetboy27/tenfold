import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";
import { serverPublicEnv } from "@/lib/env/public-server";

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Resolve (or provision) the user's workspace so the client can redirect to
    // the real /{slug} instead of a hardcoded path.
    let slug: string | null = null;
    try {
      const ws = await getOrProvisionWorkspace({
        id: data.user.id,
        email: data.user.email,
        fullName:
          (data.user.user_metadata?.full_name as string | undefined) ?? null,
      });
      slug = ws.slug;
    } catch (wsErr) {
      // Auth succeeded; workspace resolution is best-effort. Client falls back
      // to /api/workspaces/provision if slug is null.
      console.error("login: workspace resolution failed", wsErr);
    }

    return NextResponse.json(
      {
        message: "Login successful",
        user: data.user,
        slug,
      },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
