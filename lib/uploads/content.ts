import sharp from "sharp";

/**
 * What an upload IS, decided by us — never by the client.
 *
 * Every upload route stored the file with `contentType: file.type`, a value
 * the browser sets from the filename and any client can set to anything.
 * The `assets` bucket is public and serves objects with their stored type,
 * so a "logo.png" uploaded as image/svg+xml with an SVG body containing a
 * <script> becomes a page we host that runs script. The extension allowlist
 * didn't help: it checked the name, and the type came from elsewhere.
 *
 * Two rules, applied everywhere a user's bytes reach storage:
 *  - the content type follows from the validated extension, full stop;
 *  - raster images are sniffed: sharp reads the real container, and a file
 *    whose bytes disagree with its name is refused.
 */

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
export const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
};
export const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
};

export function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** The sharp format name a raster extension must sniff as. */
const SNIFF: Record<string, string[]> = {
  png: ["png"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  webp: ["webp"],
};

/**
 * Confirm the bytes really are the raster the extension claims. Throws with
 * a user-facing message otherwise. Cheap — metadata only, no decode.
 */
export async function assertRasterMatches(
  buffer: ArrayBuffer | Buffer,
  ext: string,
): Promise<void> {
  const want = SNIFF[ext];
  if (!want) throw new Error("Image must be PNG, JPG, or WEBP");
  let format: string | undefined;
  try {
    format = (
      await sharp(
        Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
      ).metadata()
    ).format;
  } catch {
    throw new Error("That file isn't a readable image");
  }
  if (!format || !want.includes(format)) {
    throw new Error(`That file isn't a ${ext.toUpperCase()} image`);
  }
}

/**
 * Refuse an SVG that could run or load anything. SVG is XML with a script
 * engine attached; a logo needs none of that. A deny-list on the decoded
 * text is deliberately blunt: a legitimate mark never contains a <script>,
 * an event handler, a foreignObject or a remote reference, so refusing is
 * the honest answer and sanitising-in-place is a bug factory.
 */
export function assertSafeSvg(text: string): void {
  const decoded = text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  const bad =
    /<\s*(script|foreignObject|iframe|embed|object|set|animate\w*)\b/i.test(
      decoded,
    ) ||
    /\bon[a-z]+\s*=/i.test(decoded) ||
    /javascript:/i.test(decoded) ||
    /data:\s*text\/html/i.test(decoded) ||
    /<!ENTITY/i.test(decoded) ||
    /\b(xlink:)?href\s*=\s*["']?\s*(https?:|\/\/)/i.test(decoded);
  if (bad) {
    throw new Error(
      "That SVG contains scripts or external references — export it as a plain vector and try again",
    );
  }
  if (!/<svg[\s>]/i.test(decoded)) throw new Error("That file isn't an SVG");
}
