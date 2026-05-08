import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { analyzeCampaignUrl, type PageContent } from '@/lib/claude/campaign-brief';
import { z } from 'zod';

const schema = z.object({
  url: z.string().url().max(2000),
  userNotes: z.string().max(1000).default(''),
});

function extractPageContent(html: string, url: string): PageContent {
  // Strip script/style blocks first
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const title =
    clean.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? url;

  const description =
    clean.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i)?.[1]?.trim() ??
    clean.match(/<meta[^>]+content=["']([^"']{1,500})[^>]+name=["']description["']/i)?.[1]?.trim() ??
    clean.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})/i)?.[1]?.trim() ??
    clean.match(/<meta[^>]+content=["']([^"']{1,500})[^>]+property=["']og:description["']/i)?.[1]?.trim() ??
    '';

  const ogImage =
    clean.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() ??
    clean.match(/<meta[^>]+content=["']([^"']+)[^>]+property=["']og:image["']/i)?.[1]?.trim();

  const headings: string[] = [];
  for (const m of clean.matchAll(/<h[1-3][^>]*>([^<]{2,200})<\/h[1-3]>/gi)) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text) headings.push(text);
    if (headings.length >= 15) break;
  }

  // Strip all remaining tags for body text
  const bodyText = clean
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title, description, headings, bodyText, ogImage };
}

export async function POST(req: Request) {
  try {
    await getSession(req);
    const body = schema.parse(await req.json());

    // Fetch the target URL with a browser-like UA and timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    let html: string;
    try {
      const res = await fetch(body.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Tenfold-Bot/1.0; +https://tenfold.nz)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`Site returned ${res.status}`);
      html = await res.text();
    } finally {
      clearTimeout(timeout);
    }

    const page = extractPageContent(html, body.url);

    if (!page.title && !page.bodyText) {
      return NextResponse.json(
        { error: 'Could not extract content from that URL. Try a different page or paste your description manually.' },
        { status: 422 },
      );
    }

    const brief = await analyzeCampaignUrl(body.url, page, body.userNotes);
    return NextResponse.json(brief);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'Unauthorized') return NextResponse.json({ error: msg }, { status: 401 });
    if (msg.includes('aborted') || msg.includes('timeout')) {
      return NextResponse.json({ error: 'The website took too long to respond.' }, { status: 408 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
