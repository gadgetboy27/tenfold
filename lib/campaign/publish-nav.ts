import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

/**
 * Load a campaign into the app store positioned at the Publish step (6), so the
 * social send-off screen has the full context it needs. Both the compositor
 * ("Continue to publish") and the Productions page ("Publish") use this so the
 * flow can never land on the lobby with a null currentCampaignId.
 *
 * Pass the finished video's URL so Publish treats it as a VIDEO post; the
 * publish route still resolves the campaign's latest composed_video when posting.
 * Returns false if the campaign can't be opened (caller should surface an error).
 */
export async function openCampaignForPublish(
  campaignId: string,
  workspaceSlug: string | undefined,
  videoUrl?: string | null,
): Promise<boolean> {
  const res = await api(`/api/campaigns/${campaignId}`, { workspaceSlug });
  if (!res.ok) return false;
  const full = (await res.json().catch(() => null)) as {
    id: string;
    name: string;
    anchor_asset_id: string | null;
    expansion_data?: Record<string, unknown>;
    prompt?: string;
    parameters?: { aspectRatio?: string; style?: string };
    assets?: Array<{
      id: string;
      url: string;
      type: string;
      created_at: string;
      metadata?: { direction?: string; hd?: boolean };
    }>;
    latestCompositionId?: string | null;
  } | null;
  if (!full?.id) return false;

  const imageAssets = (full.assets ?? [])
    .filter((a) => a.type === "image" && !a.metadata?.hd)
    .map((a) => ({
      id: a.id,
      url: a.url,
      prompt: full.prompt ?? "",
      aspectRatio: full.parameters?.aspectRatio ?? "1:1",
      style: full.parameters?.style ?? "Photorealistic",
      createdAt: a.created_at,
      direction: a.metadata?.direction,
    }));

  const expansion_data = {
    ...(full.expansion_data ?? {}),
  } as Record<string, { status?: string; url?: string }>;
  // Prefer the passed finished-video URL; else the campaign's latest video/mix.
  const fallbackVideo = (full.assets ?? []).find(
    (a) => a.type === "composed_video" || a.type === "video",
  );
  const url = videoUrl ?? fallbackVideo?.url;
  if (url) expansion_data.video = { status: "ready", url };
  const audio = (full.assets ?? []).find((a) => a.type === "audio");
  if (audio) expansion_data.music = { status: "ready", url: audio.url };

  useAppStore.getState().loadCampaign({
    id: full.id,
    name: full.name,
    current_step: 6, // Publish
    anchor_asset_id: full.anchor_asset_id ?? imageAssets[0]?.id ?? null,
    expansion_data,
    imageAssets,
    compositionId: full.latestCompositionId ?? null,
  });
  return true;
}
