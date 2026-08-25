import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { suggestWordTreatments } from "@/lib/claude/word-treatments";
import { DEFAULT_TREATMENT } from "@/lib/composition/words";

// POST /api/words/treatments — how should this wording be set?
//
// Free, deliberately. It's one small Claude call, and charging per suggestion
// would tax the exploration the Words tool exists to encourage (see
// lib/claude/word-treatments.ts). Rate limiting comes from withWorkspace.
//
// The response can never contain wording: treatments carry placement and style
// only, and the schema has no field for letters.

const bodySchema = z.object({
  words: z.string().min(1).max(500),
  context: z.string().max(500).optional(),
  count: z.number().int().min(1).max(6).optional(),
});

export const POST = withWorkspace(async (req) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Type the wording first", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const treatments = await suggestWordTreatments({
      words: parsed.data.words,
      context: parsed.data.context ?? "",
      count: parsed.data.count,
    });
    return NextResponse.json({ treatments });
  } catch {
    // Never block placing words because the suggestion service is unhappy —
    // hand back the default so the tool still works.
    return NextResponse.json({ treatments: [DEFAULT_TREATMENT] });
  }
});
