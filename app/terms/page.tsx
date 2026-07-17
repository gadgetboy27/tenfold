import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — tenfold.nz",
  description: "The terms governing your use of tenfold.nz.",
};

// NOTE: This is a starting template, not legal advice. Have it reviewed by a
// lawyer before relying on it.
//
// Still to confirm with counsel: the NZBN / company number, the registered
// address, and the governing-law clause below (currently New Zealand).
//
// The entity was previously unnamed — the Terms said "operated by tenfold",
// which is a brand, not a legal person. A contract has to say who you are
// contracting WITH, or there is nothing to enforce in either direction.
const LEGAL_ENTITY = "Blue Maunga Limited";
const LAST_UPDATED = "22 June 2026";
const CONTACT_EMAIL = "support@tenfold.nz";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to tenfold.nz
      </Link>

      <h1 className="mt-6 text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-primary [&_a]:underline">
        <section className="space-y-2">
          <h2>1. Agreement</h2>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to
            and use of tenfold.nz and its related services (the
            &ldquo;Service&rdquo;), operated by {LEGAL_ENTITY} trading as
            tenfold (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By
            creating an account or using the Service, you agree to these Terms.
            If you do not agree, do not use the Service.
          </p>
        </section>

        <section className="space-y-2">
          <h2>2. The Service</h2>
          <p>
            tenfold is a creative platform that generates images, video, audio,
            and written copy using third-party AI models, and publishes the
            resulting content to social media platforms you connect. Output is
            produced by automated systems and may vary in quality; we do not
            guarantee any particular result, performance, or outcome.
          </p>
        </section>

        <section className="space-y-2">
          <h2>3. Accounts</h2>
          <p>
            You must provide accurate information, keep your credentials secure,
            and are responsible for all activity under your account. You must be
            of legal age to form a binding contract in your jurisdiction. We may
            suspend or terminate accounts that violate these Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2>4. Credits, Subscriptions &amp; Payments</h2>
          <p>
            Generative actions consume credits. Credits and subscriptions are
            purchased through our payment processor (Stripe). Except where
            required by law, payments and consumed credits are non-refundable.
            Subscriptions renew automatically until cancelled; you may cancel at
            any time, effective at the end of the current billing period. Prices
            may change with notice for future billing periods.
          </p>
        </section>

        <section className="space-y-2">
          <h2>5. Your Content &amp; Acceptable Use</h2>
          <p>
            You are responsible for the prompts, uploads, and content you create
            and publish through the Service, and you represent that you have the
            rights to do so. You agree not to use the Service to create or
            distribute content that is unlawful, infringing, deceptive, hateful,
            or that violates the rules of any connected social platform. We may
            remove content or suspend access for violations.
          </p>
        </section>

        <section className="space-y-2">
          <h2>6. AI-Generated Output</h2>
          <p>
            Subject to your compliance with these Terms and payment of
            applicable credits, you own the content you generate, to the extent
            permitted by the underlying model providers&rsquo; terms. AI output
            may be similar to output generated for others and is not guaranteed
            to be original or free of third-party rights. You are responsible
            for reviewing output before publishing or commercial use.
          </p>
        </section>

        <section className="space-y-2">
          <h2>7. Third-Party Services</h2>
          <p>
            The Service relies on third parties including model and
            infrastructure providers and the social platforms you connect. Your
            use of those platforms is also subject to their terms. We are not
            responsible for third-party services, and connecting a social
            account authorises us to publish content on your behalf as you
            direct.
          </p>
        </section>

        <section className="space-y-2">
          <h2>8. Intellectual Property</h2>
          <p>
            The Service, including its software, design, and branding, is owned
            by us and protected by law. These Terms grant you a limited,
            non-exclusive, non-transferable right to use the Service.
          </p>
        </section>

        <section className="space-y-2">
          <h2>9. Disclaimers &amp; Limitation of Liability</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of
            any kind. To the maximum extent permitted by law, we are not liable
            for indirect, incidental, or consequential damages, and our total
            liability for any claim is limited to the amount you paid us in the
            three months preceding the claim.
          </p>
        </section>

        <section className="space-y-2">
          <h2>10. Termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or
            terminate your access if you breach these Terms or to comply with
            law. Provisions that by their nature should survive termination will
            survive.
          </p>
        </section>

        <section className="space-y-2">
          <h2>11. Changes</h2>
          <p>
            We may update these Terms from time to time. Material changes will
            be posted here with an updated date; continued use after changes
            take effect constitutes acceptance.
          </p>
        </section>

        <section className="space-y-2">
          <h2>12. Governing Law</h2>
          <p>
            These Terms are governed by the laws of New Zealand, and you submit
            to the non-exclusive jurisdiction of its courts.
          </p>
        </section>

        <section className="space-y-2">
          <h2>13. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
