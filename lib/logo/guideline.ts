import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { LogoBrief } from "./brief";
import { setBackground } from "./svg";
import type { FontPairing } from "./fonts";

// Brand-guideline one-pager (Phase 3b). The spec suggests the video composition
// layer, but that pipeline renders social/video frames — wrong tool for a
// document. pdf-lib produces a real print-ready A4 one-pager and reuses the
// PDF capability already proven for the export bundle.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** One short usage paragraph — plain sentences, no markdown. Best-effort. */
export async function guidelineCopy(brief: LogoBrief): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 220,
    system:
      "You write concise brand-logo usage guidance. Return 2–3 plain sentences (no markdown, no lists, no headings) covering clear space, acceptable backgrounds, and one thing to avoid. Speak to the business owner.",
    messages: [
      {
        role: "user",
        content: `Business: ${brief.businessName}${brief.industry ? ` (${brief.industry})` : ""}. Write the logo usage guidance.`,
      },
    ],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// pdf-lib's StandardFonts use WinAnsi (CP1252), which can't encode macrons
// (ā ē ī ō ū — common in te reo Māori) or other code points > 0xFF, and throws
// on drawText if it hits one. Transliterate macron vowels to their base letter,
// then drop anything still outside WinAnsi so a name like "Kōwhai" always
// renders instead of silently failing the whole page.
const MACRONS: Record<string, string> = {
  ā: "a",
  ē: "e",
  ī: "i",
  ō: "o",
  ū: "u",
  Ā: "A",
  Ē: "E",
  Ī: "I",
  Ō: "O",
  Ū: "U",
};
function pdfSafe(text: string): string {
  return text
    .replace(/[āēīōūĀĒĪŌŪ]/g, (c) => MACRONS[c] ?? c)
    .split("")
    .filter((c) => c.charCodeAt(0) <= 0xff)
    .join("");
}

function hexToUnit(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

interface GuidelineInput {
  businessName: string;
  svg: string;
  palette: string[];
  fonts: FontPairing | null;
  usageText: string;
}

export async function buildGuidelinePdf(
  input: GuidelineInput,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait, points
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.42, 0.46);
  const margin = 48;
  let y = 842 - margin;

  page.drawText("Brand Guidelines", {
    x: margin,
    y,
    size: 24,
    font: bold,
    color: ink,
  });
  y -= 26;
  page.drawText(pdfSafe(input.businessName), {
    x: margin,
    y,
    size: 13,
    font: reg,
    color: muted,
  });
  y -= 40;

  // Logo on white.
  const logoPng = await sharp(Buffer.from(setBackground(input.svg, "light")), {
    density: 300,
  })
    .resize(360, 240, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  const img = await pdf.embedPng(logoPng);
  page.drawRectangle({
    x: margin,
    y: y - 200,
    width: 360,
    height: 200,
    color: rgb(0.97, 0.97, 0.97),
  });
  page.drawImage(img, { x: margin, y: y - 200, width: 360, height: 200 });
  y -= 232;

  // Palette.
  page.drawText("Palette", { x: margin, y, size: 13, font: bold, color: ink });
  y -= 22;
  let x = margin;
  for (const hex of input.palette.slice(0, 5)) {
    const c = hexToUnit(hex);
    page.drawRectangle({
      x,
      y: y - 40,
      width: 72,
      height: 40,
      color: rgb(c.r, c.g, c.b),
    });
    page.drawText(hex.toUpperCase(), {
      x,
      y: y - 54,
      size: 9,
      font: reg,
      color: muted,
    });
    x += 84;
  }
  y -= 78;

  // Fonts.
  if (input.fonts) {
    page.drawText("Typography", {
      x: margin,
      y,
      size: 13,
      font: bold,
      color: ink,
    });
    y -= 20;
    page.drawText(
      `Headings: ${input.fonts.heading}    Body: ${input.fonts.body}`,
      {
        x: margin,
        y,
        size: 11,
        font: reg,
        color: ink,
      },
    );
    y -= 30;
  }

  // Usage.
  if (input.usageText) {
    page.drawText("Usage", { x: margin, y, size: 13, font: bold, color: ink });
    y -= 20;
    for (const line of wrap(pdfSafe(input.usageText), 84)) {
      page.drawText(line, { x: margin, y, size: 11, font: reg, color: ink });
      y -= 16;
    }
  }

  page.drawText("Generated by Tenfold — tenfold.nz", {
    x: margin,
    y: margin,
    size: 9,
    font: reg,
    color: muted,
  });

  return Buffer.from(await pdf.save());
}
