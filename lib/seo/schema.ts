/**
 * JSON-LD builders for the marketing pages.
 *
 * What this is for: search engines and AI answer engines read schema.org
 * markup to understand *what a page is* rather than inferring it from prose.
 * It does not directly raise rankings — it makes a page eligible for rich
 * results (FAQ accordions, pricing, app cards) and makes the product
 * legible to systems that summarise rather than link.
 *
 * Everything here is derived from the same constants the UI renders, never
 * retyped — a schema that disagrees with the visible page is worse than no
 * schema at all, and Google treats the mismatch as a manual-action risk.
 * Plans are passed in rather than imported so this module stays free of
 * `lib/billing/plans.ts`'s server-only env reads.
 */

import { LIVE_PLATFORM_NAMES } from "@/lib/marketing/platforms";

export const SITE_URL = "https://prettymuch.nz";
export const SITE_NAME = "PrettyMuch";
export const CONTACT_EMAIL = "support@prettymuch.nz";

/**
 * The business address — the "A" in NAP. One constant, rendered in the footer
 * and emitted in the Organization schema, because an entity whose address
 * reads differently in two places is two entities to a search engine.
 * Format it once here; never retype it in copy.
 */
export const BUSINESS_ADDRESS = {
  streetAddress: "Unit 3, 6 Te Kahu Street",
  addressLocality: "Paihia",
  addressRegion: "Northland",
  postalCode: "0200",
  addressCountry: "NZ",
} as const;

export const BUSINESS_ADDRESS_LINE = `${BUSINESS_ADDRESS.streetAddress}, ${BUSINESS_ADDRESS.addressLocality} ${BUSINESS_ADDRESS.postalCode}, ${BUSINESS_ADDRESS.addressRegion}, New Zealand`;

type Json = Record<string, unknown>;

export function organizationSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/prettymuch-logo-square.png`,
    description: `AI creative pipeline for small businesses — one prompt becomes images, video, music and copy, published to ${LIVE_PLATFORM_NAMES}.`,
    email: CONTACT_EMAIL,
    address: { "@type": "PostalAddress", ...BUSINESS_ADDRESS },
    areaServed: { "@type": "Country", name: "New Zealand" },
  };
}

export function websiteSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

/**
 * The product itself. `AggregateOffer` spans the subscription tiers, so the
 * price range shown in a rich result matches the pricing page exactly.
 */
export function softwareApplicationSchema(
  plans: { name: string; priceNzd: number }[],
): Json {
  const prices = plans.map((p) => p.priceNzd).filter((n) => n > 0);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Marketing Automation",
    operatingSystem: "Web",
    url: SITE_URL,
    description: `Turn one prompt into a full campaign — images, video, music and copy — then publish to ${LIVE_PLATFORM_NAMES}.`,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "NZD",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: prices.length,
      offers: plans.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.priceNzd,
        priceCurrency: "NZD",
      })),
    },
  };
}

/**
 * Only ever emit this on a page where the questions are actually visible —
 * Google requires FAQ markup to match rendered content.
 */
export function faqPageSchema(items: { q: string; plain: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items
      .filter((i) => i.plain.trim().length > 0)
      .map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: { "@type": "Answer", text: i.plain },
      })),
  };
}

/** Normalises a FAQ item to the plain text JSON-LD needs. */
export function faqPlain(item: { a: unknown; plain?: string }): string {
  return item.plain ?? (typeof item.a === "string" ? item.a : "");
}

/**
 * A Tier-1 pillar page: the Service it describes, its breadcrumb, and its
 * FAQ. The FAQ is emitted only because the page renders the same questions
 * visibly (see faqPageSchema).
 */
export function pillarSchema(p: {
  path: string;
  title: string;
  description: string;
  serviceName: string;
  faq?: { q: string; a: string }[];
}): Json[] {
  const url = `${SITE_URL}${p.path}`;
  const blocks: Json[] = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: p.serviceName,
      description: p.description,
      url,
      serviceType: p.serviceName,
      provider: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        address: { "@type": "PostalAddress", ...BUSINESS_ADDRESS },
      },
      areaServed: { "@type": "Country", name: "New Zealand" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: p.title, item: url },
      ],
    },
  ];
  if (p.faq?.length) {
    blocks.push(faqPageSchema(p.faq.map((f) => ({ q: f.q, plain: f.a }))));
  }
  return blocks;
}
