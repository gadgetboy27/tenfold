// Validation for the vectorize entry point: a user uploads an old raster logo
// to trace into an SVG. Recraft vectorize accepts png/jpg/webp; we cap at 5 MB.
// Pure so the rule is unit-testable without touching storage or a request.

export const VECTORIZE_ALLOWED_EXT = ["png", "jpg", "jpeg", "webp"] as const;
export const VECTORIZE_MAX_BYTES = 5 * 1024 * 1024;

export type VectorizeUploadError = "empty" | "type" | "size";

export function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Returns an error code when the upload is unacceptable, or null when it's fine.
 * Keeps the route thin and the rule in one place.
 */
export function validateVectorizeUpload(file: {
  name: string;
  size: number;
}): VectorizeUploadError | null {
  if (!file.size) return "empty";
  const ext = extensionOf(file.name);
  if (!(VECTORIZE_ALLOWED_EXT as readonly string[]).includes(ext)) return "type";
  if (file.size > VECTORIZE_MAX_BYTES) return "size";
  return null;
}
