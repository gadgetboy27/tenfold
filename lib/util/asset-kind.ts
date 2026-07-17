/** Media-type checks shared by the publish and download paths. */

export interface AssetKindInput {
  url: string;
  type: string;
}

/**
 * True when an asset is moving pictures rather than a still.
 *
 * Checks the extension as well as the type because the compositor saves MP4s as
 * "composed_video" (not "video") — an `=== "video"` test posted those to
 * Facebook as photos, which failed on a still-image endpoint.
 */
export function isVideoAsset(asset: AssetKindInput): boolean {
  return (
    asset.type === "video" ||
    asset.type === "composed_video" ||
    asset.url.toLowerCase().split("?")[0].endsWith(".mp4")
  );
}
