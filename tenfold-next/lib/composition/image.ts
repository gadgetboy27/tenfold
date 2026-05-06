import sharp from 'sharp';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

interface TextOverlay {
  text: string;
  position: 'top' | 'center' | 'bottom';
  style: Record<string, string>;
}

interface ComposeImageOptions {
  sourceUrl: string;
  storagePath: string;
  format: string;
  textOverlays: TextOverlay[];
}

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1920, height: 1080 },
  story: { width: 1080, height: 1920 },
  reel: { width: 1080, height: 1920 },
};

function buildTextSvg(overlays: TextOverlay[], width: number, height: number): Buffer {
  const elements = overlays.map((overlay) => {
    const y =
      overlay.position === 'top' ? 80
      : overlay.position === 'center' ? Math.floor(height / 2)
      : height - 80;
    const fontSize = overlay.style.fontSize ?? '48';
    const color = overlay.style.color ?? '#ffffff';
    const shadow = overlay.style.shadow === 'true'
      ? `<text x="${width / 2 + 2}" y="${y + 2}" text-anchor="middle" font-size="${fontSize}" fill="rgba(0,0,0,0.6)" font-family="sans-serif">${overlay.text}</text>`
      : '';
    return `${shadow}<text x="${width / 2}" y="${y}" text-anchor="middle" font-size="${fontSize}" fill="${color}" font-family="sans-serif">${overlay.text}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${elements.join('')}</svg>`;
  return Buffer.from(svg);
}

export async function composeImage(opts: ComposeImageOptions): Promise<string> {
  const { width, height } = FORMAT_DIMENSIONS[opts.format] ?? FORMAT_DIMENSIONS.square;

  const res = await fetch(opts.sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  let pipeline = sharp(buffer).resize(width, height, { fit: 'cover', position: 'center' });

  if (opts.textOverlays.length > 0) {
    const svgBuf = buildTextSvg(opts.textOverlays, width, height);
    pipeline = pipeline.composite([{ input: svgBuf, gravity: 'center' }]);
  }

  const composed = await pipeline.jpeg({ quality: 90 }).toBuffer();

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from('assets')
    .upload(opts.storagePath, composed, { contentType: 'image/jpeg', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('assets').getPublicUrl(opts.storagePath);
  return data.publicUrl;
}
