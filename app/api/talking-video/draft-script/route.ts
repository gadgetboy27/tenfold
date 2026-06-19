import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/billing/entitlements";
import { generateAdScript } from "@/lib/claude/ad-script";
import { getLanguage } from "@/lib/fal/talking-video";
import { getWorkspaceBrandVoice } from "@/lib/claude/brand-voice";

const draftSchema = z.object({
  tone: z.enum(["professional", "casual", "playful"]).default("professional"),
  targetSeconds: z.number().int().min(5).max(30).default(15),
  language: z.string().max(8).default("en"),
  product: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(1500).default(""),
    features: z.array(z.string().max(200)).max(8).default([]),
    callToAction: z.string().max(200).default(""),
  }),
});

// POST /api/talking-video/draft-script — write a spokesperson script the user can
// review and EDIT before committing credits. This is how the user controls the
// spoken words: draft here, edit freely, then submit it back as `scriptOverride`.
// Drafting is free (inference is ~$0.002) so users can iterate on the wording.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = draftSchema.parse(await req.json());

    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        { error: "Spoken video is a Pro feature.", upgrade: true },
        { status: 403 },
      );
    }

    const brandVoice = await getWorkspaceBrandVoice(session.workspaceId).catch(
      () => null,
    );
    const result = await generateAdScript({
      productName: body.product.name,
      productDescription: body.product.description,
      features: body.product.features,
      callToAction: body.product.callToAction,
      tone: body.tone,
      targetSeconds: body.targetSeconds,
      language: getLanguage(body.language).label,
      brandVoice: brandVoice ?? undefined,
    });

    return NextResponse.json({ script: result.text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
