// Virtual try-on: FASHN v1.6 on fal — render a garment onto a model photo.
// It's a single image-output fal job, so it reuses the existing
// /api/webhooks/fal handler (which stores `images`); only the submit route is
// dedicated. ~$0.075/generation.

export const TRYON_MODEL = "fal-ai/fashn/tryon/v1.6";

export type TryonCategory = "auto" | "tops" | "bottoms" | "one-pieces";

export interface TryonCategoryOption {
  id: TryonCategory;
  label: string;
}

export const TRYON_CATEGORIES: TryonCategoryOption[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "tops", label: "Top" },
  { id: "bottoms", label: "Bottom" },
  { id: "one-pieces", label: "Dress / full outfit" },
];

/** Build the fal input for {@link TRYON_MODEL}: model (person) + garment images. */
export function tryonInput(p: {
  modelImageUrl: string;
  garmentImageUrl: string;
  category: TryonCategory;
}): Record<string, unknown> {
  return {
    model_image: p.modelImageUrl,
    garment_image: p.garmentImageUrl,
    category: p.category,
    mode: "balanced",
  };
}
