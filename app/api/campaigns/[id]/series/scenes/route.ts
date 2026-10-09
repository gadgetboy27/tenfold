import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { generateScenes } from "@/lib/claude/series-scenes";
import { SERIES_DEFAULT, SERIES_MAX, SERIES_MIN } from "@/lib/series/scenes";
import { errorMessage } from "@/lib/api/error-message";

const schema = z.object({
  count: z
    .number()
    .int()
    .min(SERIES_MIN)
    .max(SERIES_MAX)
    .default(SERIES_DEFAULT),
  /** What the product is, if the campaign's own brief isn't the right thing. */
  description: z.string().max(600).optional(),
});

// POST /api/campaigns/:id/series/scenes — Claude drafts the scene lines for a
// Series. Free to the user (a tiny Haiku call), so it is rate-limited hard
// instead of metered.
export const POST = withWorkspace<{ id: string }>(
  async (req, { db, params }) => {
    const body = schema.parse(await req.json());

    const { data: campaign } = await db
      .from("campaigns")
      .select("id, prompt")
      .eq("id", params.id)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }
    const description = (
      body.description?.trim() ||
      (campaign as { prompt: string | null }).prompt ||
      ""
    ).slice(0, 600);
    if (description.length < 3) {
      return NextResponse.json(
        { error: "Say what the product is first." },
        { status: 400 },
      );
    }

    try {
      const { scenes } = await generateScenes({
        description,
        count: body.count,
      });
      return NextResponse.json({ scenes });
    } catch (e) {
      return NextResponse.json(
        { error: errorMessage(e, "Couldn't plan the scenes") },
        { status: 502 },
      );
    }
  },
  { rateLimit: 12 },
);
