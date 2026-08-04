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

export const SITE_URL = "https://prettymuch.nz";
export const SITE_NAME = "PrettyMuch";

type Json = Record<string, unknown>;

export function organizationSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/prettymuch-logo-square.png`,
    description:
      "AI creative pipeline for small businesses — one prompt becomes images, video, music and copy, published to 13 social platforms.",
    email: "support@prettymuch.nz",
    address: { "@type": "PostalAddress", addressCountry: "NZ" },
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
    description:
      "Turn one prompt into a full campaign — images, video, music and copy — then publish to up to 13 social platforms.",
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
