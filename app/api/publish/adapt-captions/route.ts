import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { adaptCaptions } from "@/lib/claude/adapt-captions";

const schema = z.object({
  caption: z.string().max(3000),
  platforms: z.array(z.string().max(40)).min(1).max(12),
});

// POST /api/publish/adapt-captions — AI rewrites one caption to fit each
// platform's character limit + voice. A publish-time convenience (no credits).
export const POST = withWorkspace(async (req) => {
  const { caption, platforms } = schema.parse(await req.json());
  const captions = await adaptCaptions(caption, platforms);
  return NextResponse.json({ captions });
});
