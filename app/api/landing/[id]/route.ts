import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/with-workspace";
import { blockSchema } from "@/lib/landing/blocks";

/**
 * One landing page: edit it, publish it, take it down, delete it.
 *
 * All free. The credits bought the writing (POST /api/campaigns/:id/landing);
 * charging again to change a word, or to put the page live, would tax the part
 * of the job the customer does themselves.
 */

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(300).optional(),
  blocks: z.array(blockSchema).min(1).max(12).optional(),
  /** true publishes, false takes it down. A page down is a page that 404s. */
  published: z.boolean().optional(),
});

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { db, params }) => {
    const body = patchSchema.parse(await req.json());

    const { data: current } = await db
      .from("landing_pages")
      .select("published_at")
      .eq("id", params.id)
      .maybeSingle();
    if (!current)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const wasPublishedAt = (current as { published_at: string | null })
      .published_at;

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.blocks !== undefined) update.blocks = body.blocks;
    if (body.published !== undefined) {
      // published_at answers "live since when", so an edit-and-republish must
      // not reset it — only a page that was actually down gets a new date.
      // Taking one down clears it, which is what makes the public route 404.
      update.published_at = body.published
        ? (wasPublishedAt ?? new Date().toISOString())
        : null;
    }

    const { data, error } = await db
      .from("landing_pages")
      .update(update)
      .eq("id", params.id)
      .select(
        "id, slug, style, title, description, blocks, theme, published_at",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ page: data });
  },
);

export const DELETE = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    // Leads cascade with the page (migration 0034). That is the right
    // behaviour for a draft and a sharp edge for a live one, so the UI asks
    // first and says how many leads go with it.
    const { error } = await db
      .from("landing_pages")
      .delete()
      .eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  },
);
