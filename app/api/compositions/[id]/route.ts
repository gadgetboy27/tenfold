import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import {
  ASPECT_TO_FORMAT,
  backgroundSchema,
  compositionOverridesSchema,
  formatToAspect,
  layerSchema,
} from "@/lib/composition/layers";

// Save/load for the layered compositor (docs/tenfold-compositor-brief.md).
// Rows are the existing compositions table; aspect is stored via the legacy
// format column, background/layers in their jsonb columns.

const patchSchema = z
  .object({
    aspect: z.enum(["9:16", "1:1", "16:9"]).optional(),
    background: backgroundSchema.optional(),
    layers: z.array(layerSchema).max(20).optional(),
    overrides: compositionOverridesSchema.optional(),
    caption: z.string().max(2200).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Empty patch" });

interface CompositionRow {
  format: string;
  [key: string]: unknown;
}

function withAspect(row: CompositionRow) {
  return { ...row, aspect: formatToAspect(row.format) };
}

export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { data } = await db
      .from("compositions")
      .select("*")
      .eq("id", params.id)
      .single();
    if (!data) {
      return NextResponse.json(
        { error: "Composition not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(withAspect(data as CompositionRow));
  },
);

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { db, params }) => {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid composition patch", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.aspect) update.format = ASPECT_TO_FORMAT[body.aspect];
    if (body.background !== undefined) update.background = body.background;
    if (body.layers !== undefined) update.layers = body.layers;
    if (body.overrides !== undefined) update.overrides = body.overrides;
    if (body.caption !== undefined) update.caption = body.caption;

    const { data, error } = await db
      .from("compositions")
      .update(update)
      .eq("id", params.id)
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Composition not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(withAspect(data as CompositionRow));
  },
);
