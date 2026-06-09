import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";

export async function POST(req: Request) {
  let userId: string | undefined;

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (bearerToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase.auth.getUser(bearerToken);
    userId = data.user?.id;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve display name from Supabase Auth so the slug matches other entry points.
  const admin = createSupabaseAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const authUser = userData?.user;

  try {
    const result = await getOrProvisionWorkspace({
      id: userId,
      email: authUser?.email,
      fullName:
        (authUser?.user_metadata?.full_name as string | undefined) ?? null,
    });
    return NextResponse.json(result, {
      status: result.alreadyProvisioned ? 200 : 201,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Provisioning failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
