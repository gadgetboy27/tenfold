import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

// Client-side branded one-pager: logo + brand name + anchor image + caption in a
// single shareable PDF (client approval / handoff). Images are normalised to PNG
// via a canvas (an off-DOM <img> from a blob URL — same-origin, so the canvas is
// never tainted, and it handles webp/svg/jpg alike). No server round-trip.

async function pngBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    const objUrl = URL.createObjectURL(await res.blob());
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("image load failed"));
        i.src = objUrl;
      });
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const png = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/png"),
      );
      return png ? new Uint8Array(await png.arrayBuffer()) : null;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

// Helvetica (WinAnsi) can't encode emoji or smart quotes — strip anything outside
// Latin-1 so a caption with an emoji doesn't throw mid-render.
const safe = (s: string) => s.replace(/[^\x00-\xFF]/g, "").trim();

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxW: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(test, size) > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface CampaignPdfInput {
  imageUrl?: string | null;
  caption?: string;
  logoUrl?: string | null;
  brandName?: string | null;
}

export async function downloadCampaignPdf(
  input: CampaignPdfInput,
): Promise<void> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const margin = 48;
  const contentW = width - margin * 2;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = height - margin;

  if (input.logoUrl) {
    const bytes = await pngBytes(input.logoUrl);
    if (bytes) {
      const png = await pdf.embedPng(bytes);
      const lw = 84;
      const lh = (png.height / png.width) * lw;
      page.drawImage(png, { x: margin, y: y - lh, width: lw, height: lh });
      y -= lh + 14;
    }
  }

  if (input.brandName && safe(input.brandName)) {
    page.drawText(safe(input.brandName), {
      x: margin,
      y: y - 18,
      size: 18,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 34;
  }

  if (input.imageUrl) {
    const bytes = await pngBytes(input.imageUrl);
    if (bytes) {
      const png = await pdf.embedPng(bytes);
      const maxH = 430;
      let iw = contentW;
      let ih = (png.height / png.width) * iw;
      if (ih > maxH) {
        ih = maxH;
        iw = (png.width / png.height) * ih;
      }
      page.drawImage(png, { x: margin, y: y - ih, width: iw, height: ih });
      y -= ih + 26;
    }
  }

  const caption = input.caption ? safe(input.caption) : "";
  if (caption) {
    const size = 12;
    for (const line of wrap(caption, font, size, contentW)) {
      if (y < margin + 30) break;
      page.drawText(line, {
        x: margin,
        y: y - size,
        size,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= size * 1.5;
    }
  }

  page.drawText("Made with tenfold.nz", {
    x: margin,
    y: margin - 14,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  const bytes = await pdf.save();
  const href = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
  );
  const el = document.createElement("a");
  el.href = href;
  el.download = "campaign-one-pager.pdf";
  el.click();
  URL.revokeObjectURL(href);
}
