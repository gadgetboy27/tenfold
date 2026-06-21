import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — tenfold.nz",
  description: "How tenfold.nz collects, uses, and protects your data.",
};

// NOTE: This is a starting template, not legal advice. Have it reviewed and
// tailored to your entity, jurisdiction, and actual data practices before
// relying on it. Keep the subprocessor list in sync with the services you use.
const LAST_UPDATED = "22 June 2026";
const CONTACT_EMAIL = "support@tenfold.nz";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to tenfold.nz
      </Link>

      <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <section className="space-y-2">
          <h2>1. Introduction</h2>
          <p>
            This Privacy Policy explains how tenfold (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;) collects, uses, and protects information when you
            use tenfold.nz (the &ldquo;Service&rdquo;). By using the Service, you
            agree to this policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2>2. Information We Collect</h2>
          <ul>
            <li>
              <strong>Account information</strong> — your name, email, and login
              details (including via Google or Facebook sign-in).
            </li>
            <li>
              <strong>Content you create</strong> — prompts, uploads, and the
              images, video, audio, and copy generated through the Service.
            </li>
            <li>
              <strong>Connected social accounts</strong> — access tokens and
              account identifiers needed to publish on your behalf to the
              platforms you connect.
            </li>
            <li>
              <strong>Payment information</strong> — processed by Stripe. We do
              not store your full card details.
            </li>
            <li>
              <strong>Usage data</strong> — basic logs and analytics about how
              the Service is used, to operate and improve it.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2>3. How We Use Information</h2>
          <p>
            We use your information to provide and operate the Service, generate
            and publish content at your direction, process payments and credits,
            communicate with you, maintain security, and comply with legal
            obligations.
          </p>
        </section>

        <section className="space-y-2">
          <h2>4. Service Providers (Subprocessors)</h2>
          <p>
            We share data with trusted providers only as needed to run the
            Service, including:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — database, authentication, and storage
            </li>
            <li>
              <strong>fal.ai</strong> — AI image, video, and audio generation
            </li>
            <li>
              <strong>Anthropic</strong> — AI text/script generation
            </li>
            <li>
              <strong>Ayrshare &amp; Meta</strong> — social media publishing
            </li>
            <li>
              <strong>Stripe</strong> — payment processing
            </li>
            <li>
              <strong>Resend</strong> — transactional email
            </li>
            <li>
              <strong>Railway</strong> — application hosting
            </li>
          </ul>
          <p>
            These providers process data under their own terms and privacy
            policies. We do not sell your personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2>5. Connected Social Accounts</h2>
          <p>
            When you connect a social account, we store the tokens required to
            publish content you create and to show basic account and post
            information. We access these accounts only to perform actions you
            request. You can disconnect an account at any time, which revokes our
            access going forward.
          </p>
        </section>

        <section className="space-y-2">
          <h2>6. Data Retention</h2>
          <p>
            We keep your information for as long as your account is active or as
            needed to provide the Service, comply with legal obligations, resolve
            disputes, and enforce agreements. You may request deletion of your
            account and associated data.
          </p>
        </section>

        <section className="space-y-2">
          <h2>7. Security</h2>
          <p>
            We use reasonable technical and organisational measures to protect
            your data, including encryption in transit and access controls. No
            method of transmission or storage is completely secure, and we cannot
            guarantee absolute security.
          </p>
        </section>

        <section className="space-y-2">
          <h2>8. Your Rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct,
            export, or delete your personal information, and to object to or
            restrict certain processing. To exercise these rights, contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section className="space-y-2">
          <h2>9. Cookies</h2>
          <p>
            We use cookies and similar technologies for authentication, security,
            and basic analytics. You can control cookies through your browser
            settings, though some features may not work without them.
          </p>
        </section>

        <section className="space-y-2">
          <h2>10. Children</h2>
          <p>
            The Service is not directed to children under 16, and we do not
            knowingly collect their personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2>11. Changes</h2>
          <p>
            We may update this policy from time to time. Material changes will be
            posted here with an updated date.
          </p>
        </section>

        <section className="space-y-2">
          <h2>12. Contact</h2>
          <p>
            Questions about your privacy? Contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
