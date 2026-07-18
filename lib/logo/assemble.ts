import { buildLogoBundle, paletteFromSvg, type BundleFile } from "./package";
import { suggestFontPairing, type FontPairing } from "./fonts";
import { guidelineCopy, buildGuidelinePdf } from "./guideline";
import type { LogoBrief } from "./brief";

// Orchestrates the full brand package: the pure file bundle plus the two
// AI-assisted extras (font pairing + guideline one-pager). Kept separate from
// package.ts so the pure, unit-tested bundle builder never transitively pulls in
// the Anthropic client. Both extras are best-effort — a Claude hiccup must not
// fail the package the user paid 10 credits for.
export async function assembleBrandPackage({
  svg,
  brief,
}: {
  svg: string;
  brief: LogoBrief;
}): Promise<{
  files: BundleFile[];
  palette: string[];
  fonts: FontPairing | null;
}> {
  const files = await buildLogoBundle(svg);
  const palette = paletteFromSvg(svg);

  let fonts: FontPairing | null = null;
  try {
    fonts = await suggestFontPairing(brief);
  } catch {
    fonts = null;
  }

  try {
    const usageText = await guidelineCopy(brief).catch(() => "");
    const pdf = await buildGuidelinePdf({
      businessName: brief.businessName,
      svg,
      palette,
      fonts,
      usageText,
    });
    files.push({ path: "brand-guidelines.pdf", buffer: pdf });
  } catch {
    // No guideline page — the rest of the bundle still ships.
  }

  return { files, palette, fonts };
}
