import Image from "next/image";
import type {
  LandingBlock,
  LandingCta,
  LandingDoc,
} from "@/lib/landing/blocks";
import { fontFaceCss, fontStack, toneStyle, type ToneStyle } from "./theme";
import { LeadForm } from "./LeadForm";

/**
 * The public landing page.
 *
 * A server component that renders a validated LandingDoc as a vertical stack —
 * one section per block, in order, no coordinates anywhere. That constraint is
 * the whole reason this survives a phone: every block is responsive by
 * construction, so there is no arrangement of blocks that can break the layout.
 *
 * Fixed light colours from the page's own theme snapshot, deliberately ignoring
 * the visitor's OS theme — see components/landing/theme.ts.
 */

function Cta({ cta, tone }: { cta: LandingCta; tone: ToneStyle }) {
  return (
    <a
      href={cta.href}
      {...(cta.href.startsWith("http")
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="inline-block rounded-lg px-7 py-3.5 text-base font-semibold transition-opacity hover:opacity-90"
      style={{ background: tone.buttonBg, color: tone.buttonColor }}
    >
      {cta.label}
    </a>
  );
}

function Block({
  block,
  doc,
  slug,
}: {
  block: LandingBlock;
  doc: LandingDoc;
  slug: string;
}) {
  const tone = toneStyle(block.tone, doc.theme);
  const section = "px-6 py-16 sm:px-8 sm:py-20";
  const inner = "mx-auto w-full max-w-5xl";

  switch (block.kind) {
    case "hero":
      return (
        <section
          className={section}
          style={{ background: tone.background, color: tone.color }}
        >
          <div
            className={`${inner} flex flex-col items-center gap-8 md:flex-row md:items-center md:gap-12`}
          >
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
                {block.headline}
              </h1>
              {block.sub && (
                <p
                  className="mt-4 text-lg leading-relaxed"
                  style={{ color: tone.subColor }}
                >
                  {block.sub}
                </p>
              )}
              {block.cta && (
                <div className="mt-7">
                  <Cta cta={block.cta} tone={tone} />
                </div>
              )}
            </div>
            {block.imageUrl && (
              <div className="w-full flex-1">
                <Image
                  src={block.imageUrl}
                  alt=""
                  width={1080}
                  height={1080}
                  // The one image above the fold, and the thing the click was
                  // made on — never lazy.
                  priority
                  unoptimized
                  className="h-auto w-full rounded-2xl object-cover shadow-lg"
                />
              </div>
            )}
          </div>
        </section>
      );

    case "features":
      return (
        <section
          className={section}
          style={{ background: tone.background, color: tone.color }}
        >
          <div className={inner}>
            {block.heading && (
              <h2 className="mb-10 text-center text-3xl font-bold">
                {block.heading}
              </h2>
            )}
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {block.items.map((item, i) => (
                <div key={i}>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  {item.body && (
                    <p
                      className="mt-2 leading-relaxed"
                      style={{ color: tone.subColor }}
                    >
                      {item.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "gallery":
      return (
        <section
          className={section}
          style={{ background: tone.background, color: tone.color }}
        >
          <div className={inner}>
            {block.heading && (
              <h2 className="mb-10 text-center text-3xl font-bold">
                {block.heading}
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {block.imageUrls.map((url, i) => (
                <Image
                  key={i}
                  src={url}
                  alt=""
                  width={720}
                  height={720}
                  loading="lazy"
                  unoptimized
                  className="h-full w-full rounded-xl object-cover"
                />
              ))}
            </div>
          </div>
        </section>
      );

    case "text":
      return (
        <section
          className={section}
          style={{ background: tone.background, color: tone.color }}
        >
          <div className="mx-auto w-full max-w-2xl">
            {block.heading && (
              <h2 className="mb-5 text-3xl font-bold">{block.heading}</h2>
            )}
            {/* Paragraph breaks preserved. Copy written as prose arrives with
                newlines in it, and rendering it as one wall is how a good page
                reads like a terms-of-service. */}
            {block.body.split(/\n{2,}/).map((para, i) => (
              <p
                key={i}
                className="mb-4 text-lg leading-relaxed last:mb-0"
                style={{ color: tone.subColor }}
              >
                {para}
              </p>
            ))}
          </div>
        </section>
      );

    case "cta":
      return (
        <section
          className={section}
          style={{ background: tone.background, color: tone.color }}
        >
          <div className={`${inner} text-center`}>
            <h2 className="text-3xl font-bold sm:text-4xl">{block.headline}</h2>
            {block.sub && (
              <p className="mt-4 text-lg" style={{ color: tone.subColor }}>
                {block.sub}
              </p>
            )}
            <div className="mt-8">
              <Cta cta={block.cta} tone={tone} />
            </div>
          </div>
        </section>
      );

    case "form":
      return (
        <section
          id="form"
          // Anchors from a hero or cta button land here; without this the
          // browser jumps to the section's very top edge, under any sticky
          // chrome, and the heading is the first thing off-screen.
          className={`${section} scroll-mt-4`}
          style={{ background: tone.background, color: tone.color }}
        >
          <div className="mx-auto w-full max-w-xl text-center">
            {block.heading && (
              <h2 className="text-3xl font-bold">{block.heading}</h2>
            )}
            {block.sub && (
              <p className="mt-3 text-lg" style={{ color: tone.subColor }}>
                {block.sub}
              </p>
            )}
            <div className="mt-8">
              <LeadForm
                slug={slug}
                fields={block.fields}
                submitLabel={block.submitLabel}
                successMessage={block.successMessage}
                tone={tone}
              />
            </div>
          </div>
        </section>
      );

    case "footer":
      return (
        <footer
          className="px-6 py-10 sm:px-8"
          style={{ background: tone.background, color: tone.color }}
        >
          <div
            className={`${inner} flex flex-col items-center gap-3 text-center`}
          >
            {doc.theme.logoUrl && (
              <Image
                src={doc.theme.logoUrl}
                alt={block.businessName || ""}
                width={160}
                height={48}
                unoptimized
                className="h-10 w-auto object-contain"
              />
            )}
            {block.businessName && (
              <p className="font-semibold">{block.businessName}</p>
            )}
            {block.line && (
              <p className="text-sm" style={{ color: tone.subColor }}>
                {block.line}
              </p>
            )}
            <p className="text-xs" style={{ color: tone.subColor }}>
              © {new Date().getFullYear()}
              {block.businessName ? ` ${block.businessName}` : ""}
            </p>
          </div>
        </footer>
      );
  }
}

export function LandingPageView({
  doc,
  slug,
}: {
  doc: LandingDoc;
  slug: string;
}) {
  return (
    <div
      style={{
        fontFamily: fontStack(doc.theme.font),
        background: "#ffffff",
        // The app's root layout hardcodes <html class="dark"> and a dark body.
        // This page is the customer's brand, not our chrome, so it paints its
        // own ground and tells the browser to render native controls (autofill,
        // pickers, scrollbars) light to match — otherwise a dark autofill
        // highlight lands on a white form.
        colorScheme: "light",
      }}
    >
      {/* Only the brand's own face, inlined — see components/landing/theme.ts. */}
      <style>{fontFaceCss(doc.theme.font)}</style>
      {doc.blocks.map((block) => (
        <Block key={block.id} block={block} doc={doc} slug={slug} />
      ))}
    </div>
  );
}
