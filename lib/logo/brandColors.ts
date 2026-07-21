import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RgbColor } from "@/lib/logo/promptComposer";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** "#RRGGBB" or "RRGGBB" → RGB, or null if it isn't a valid 6-digit hex. */
function hexToRgb(value: unknown): RgbColor | null {
  if (typeof value !== "string") return null;
  const h = value.replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * The workspace brand-kit palette as Recraft `colors` (primary → secondary →
 * accent), for the "Brand colors" logo option. Returns undefined when there's
 * no kit or no valid colours, so callers fall back to letting the model choose.
 */
export async function resolveBrandColors(
  admin: Admin,
  workspaceId: string,
): Promise<RgbColor[] | undefined> {
  const { data } = await admin
    .from("brand_kits")
    .select("primary_color, secondary_color, accent_color")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return undefined;
  const kit = data as {
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
  };
  const colors = [kit.primary_color, kit.secondary_color, kit.accent_color]
    .map(hexToRgb)
    .filter((c): c is RgbColor => c !== null);
  return colors.length ? colors : undefined;
}
