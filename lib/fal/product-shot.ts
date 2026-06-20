// Product-in-scene: fal-ai/bria/product-shot — drop a product into a generated
// lifestyle scene from a text description, preserving the product. Single
// image→image job, so it reuses the existing /api/webhooks/fal handler; only the
// submit route is dedicated. Trained on licensed data — safe for commercial ads.

export const PRODUCT_SHOT_MODEL = "fal-ai/bria/product-shot";

// Documented-safe manual_placement_selection values.
export type Placement = "bottom_center" | "center_vertical" | "upper_left";

export interface PlacementOption {
  id: Placement;
  label: string;
}

export const PLACEMENTS: PlacementOption[] = [
  { id: "bottom_center", label: "Bottom" },
  { id: "center_vertical", label: "Center" },
  { id: "upper_left", label: "Top-left" },
];

/** Build the fal input for {@link PRODUCT_SHOT_MODEL}. */
export function productShotInput(p: {
  productImageUrl: string;
  scene: string;
  placement: Placement;
}): Record<string, unknown> {
  return {
    image_url: p.productImageUrl,
    scene_description: p.scene,
    optimize_description: true,
    num_results: 1,
    fast: true,
    placement_type: "manual_placement",
    manual_placement_selection: p.placement,
  };
}
