import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { z } from "zod";

const FONTS = [
  "Inter",
  "Montserrat",
  "Playfair Display",
  "Lora",
  "Roboto",
] as const;
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const updateSchema = z.object({
  primary_color: hexColor.optional(),
  secondary_color: hexColor.optional(),
  accent_color: hexColor.optional(),
  font_family: z.enum(FONTS).optional(),
  // Body copy face; null = same as font_family (the pre-0035 behaviour).
  body_font_family: z.enum(FONTS).nullable().optional(),
  tagline: z.string().max(200).optional(),
  // Nullable so "remove logo" persists (previously stripped by this schema,
  // which made logo removal a UI-only illusion).
  logo_url: z.string().url().nullable().optional(),
  logo_dark_url: z.string().url().nullable().optional(),
  // Set when the client applies a "Brand Brain" (analyze-url) proposal —
  // lets the UI show "imported from example.com" later.
  source_url: z.string().url().optional(),
  imported_at: z.string().datetime().optional(),
});

export const GET = withWorkspace(
  async (_req, { db }) => {
    const { data } = await db.from("brand_kits").select("*").single();
    return NextResponse.json(data ?? {});
  },
  { rateLimit: false },
);

export const PATCH = withWorkspace(async (req, { db, session }) => {
  const body = updateSchema.parse(await req.json());

  const { data, error } = await db
    .from("brand_kits")
    .upsert(
      {
        workspace_id: session.workspaceId,
        ...body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return NextResponse.json(data);
});
