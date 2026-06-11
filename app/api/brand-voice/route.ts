import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { brandVoiceSchema } from "@/lib/validation/schemas";
import { analyzeBrandVoice } from "@/lib/claude/brand-voice";

// GET — current brand voice profile + the source samples.
export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("brand_kits")
      .select("voice_profile, voice_samples")
      .eq("workspace_id", session.workspaceId)
      .single();
    return NextResponse.json({
      profile: data?.voice_profile ?? null,
      samples: data?.voice_samples ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// POST — analyse the supplied posts into a voice profile and store it.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const { samples } = brandVoiceSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const profile = await analyzeBrandVoice(samples);
    if (!profile) {
      return NextResponse.json(
        { error: "Could not analyse voice from those samples" },
        { status: 422 },
      );
    }

    const { error } = await admin.from("brand_kits").upsert(
      {
        workspace_id: session.workspaceId,
        voice_profile: profile,
        voice_samples: samples,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ profile, samples });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
