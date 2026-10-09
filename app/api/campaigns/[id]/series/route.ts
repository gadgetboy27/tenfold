import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getBalance } from "@/lib/credits/balance";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { enqueueJob } from "@/lib/fal/queue";
import {
  SCENE_MAX_CHARS,
  SERIES_MAX,
  SERIES_MIN,
  cleanScenes,
} from "@/lib/series/scenes";
import { seriesResponse } from "@/lib/series/respond";
import { startSeries, type SeriesDb } from "@/lib/series/start";
import { isWorkspaceStorageUrl } from "@/lib/series/subject-url";

const schema = z.object({
  subjectUrl: z.string().url(),
  scenes: z.array(z.string().max(SCENE_MAX_CHARS * 2)).max(SERIES_MAX * 2),
});

// POST /api/campaigns/:id/series — one subject, several scenes. One
// image_variation job per scene (lib/series/start.ts has the why). Credits only.
export const POST = withWorkspace<{ id: string }>(
  async (req, { db, session, params }) => {
    const body = schema.parse(await req.json());

    const { data: campaign } = await db
      .from("campaigns")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }

    if (!isWorkspaceStorageUrl(body.subjectUrl, session.workspaceId)) {
      return NextResponse.json(
        {
          error:
            "Use a picture from your own project or an upload — that one can't be used.",
        },
        { status: 400 },
      );
    }

    const scenes = cleanScenes(body.scenes);
    if (scenes.length < SERIES_MIN) {
      return NextResponse.json(
        { error: `Add at least ${SERIES_MIN} different scenes.` },
        { status: 400 },
      );
    }

    const result = await startSeries(
      {
        db: db as unknown as SeriesDb,
        workspaceId: session.workspaceId,
        campaignId: params.id,
        appUrl: process.env.APP_URL ?? "",
        getBalance,
        debit: (ws, jobId) => debitCredits(ws, jobId, "image_variation"),
        refund: refundCredits,
        enqueue: (input, webhookUrl) =>
          enqueueJob("image_variation", input, webhookUrl),
        newId: uuidv4,
      },
      { subjectUrl: body.subjectUrl, scenes },
    );

    const { status, body: out } = seriesResponse(result);
    return NextResponse.json(out, { status });
  },
);
