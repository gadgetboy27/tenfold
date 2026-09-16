import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { brandVoiceSchema } from "@/lib/validation/schemas";
import { analyzeBrandVoice } from "@/lib/claude/brand-voice";

// GET — current brand voice profile + the source samples.
export const GET = withWorkspace(
  async (_req, { db }) => {
    const { data } = await db
      .from("brand_kits")
      .select("voice_profile, voice_samples")
      .single();
    return NextResponse.json({
      profile: data?.voice_profile ?? null,
      samples: data?.voice_samples ?? [],
    });
  },
  { rateLimit: false },
);

// POST — analyse the supplied posts into a voice profile and store it.
export const POST = withWorkspace(async (req, { db, session }) => {
  const { samples } = brandVoiceSchema.parse(await req.json());

  const profile = await analyzeBrandVoice(samples);
  if (!profile) {
    return NextResponse.json(
      { error: "Could not analyse voice from those samples" },
      { status: 422 },
    );
  }

  const { error } = await db.from("brand_kits").upsert(
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
});
