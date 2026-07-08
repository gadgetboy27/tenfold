import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  tagline: z.string().max(200).optional(),
  // Nullable so "remove logo" persists (previously stripped by this schema,
  // which made logo removal a UI-only illusion).
  logo_url: z.string().url().nullable().optional(),
  logo_dark_url: z.string().url().nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("brand_kits")
      .select("*")
      .eq("workspace_id", session.workspaceId)
      .single();
    return NextResponse.json(data ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession(req);
    const body = updateSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
