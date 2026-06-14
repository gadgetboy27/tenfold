# Tenfold — Brand Kit

> One prompt, amplified tenfold. The brand should feel premium, creative, and
> AI-native — confident violet on near-black, with a refined serif wordmark.

## Logo

The mark is an **amplification burst**: a single origin radiating outward —
one idea becoming many. It doubles as a creative "spark."

| Asset | File | Use |
|---|---|---|
| App icon (favicon) | `app/icon.svg` | Browser tab, PWA, social avatar — white burst on a violet squircle |
| Mark (gradient, transparent) | `public/brand/tenfold-mark.svg` | Standalone mark on any background |
| Horizontal lockup | `public/brand/tenfold-logo.svg` | Mark + "tenfold" wordmark, for dark backgrounds |
| React component | `components/brand/Logo.tsx` | In-app — `<Logo size={28} withWordmark />` |

**Clear space:** keep at least the height of the mark's center dot around the logo.
**Minimum size:** mark 20px; full lockup 120px wide.
**Don't:** recolour the mark outside the palette, stretch it, add shadows/outlines,
or place the gradient mark on a busy photo without the squircle.

## Colour

| Token | HSL (in `globals.css`) | Hex | Use |
|---|---|---|---|
| Primary / Accent | `252 97% 67%` | `#7C5CFC` | Brand violet — CTAs, mark, highlights |
| Gradient light | — | `#9D7CFF` | Mark/gradient start |
| Gradient deep | — | `#6438F5` / `#5B2EE6` | Mark/gradient end |
| Background | `0 0% 4%` | `#0A0A0A` | App canvas (dark) |
| Foreground | `0 0% 94%` | `#F0F0F0` | Primary text |

Gradient direction: top-left → bottom-right (light → deep).

## Typography

- **Wordmark / display:** the app serif (`font-serif`), bold, tight tracking — set lowercase "tenfold".
- **UI / body:** the app sans (`font-sans`).
- **Numerics (credits, prices):** `font-mono`, tabular.

## Voice

Confident, plain-spoken, creative. "One prompt, ten ways." Avoid hype-speak and
jargon. Credits are always called **credits** (never "tokens").

## Applying to Stripe (invoices / checkout / receipts)

Stripe → **Settings → Branding**: upload `app/icon.svg` (or a 512px PNG export of
it) as the icon/logo, set the **accent colour to `#7C5CFC`**. This brands the
hosted checkout, the Customer Portal, and every invoice/receipt PDF automatically.

## Applying to Ayrshare (white-label the social-connect page) — IMPORTANT

Customers must **never see the word "Ayrshare."** The in-app copy is already
neutral ("Connect your socials", handled by Tenfold), but the **hosted account-
linking page** Ayrshare opens (via the SSO/JWT flow) shows Ayrshare branding by
default. To make it look like Tenfold:

1. Ayrshare dashboard → **Settings → White Label** (Business plan feature).
2. Upload the Tenfold logo (`public/brand/tenfold-icon-512.png`), set the
   **brand colour to `#7C5CFC`**, and configure a **custom domain** (e.g.
   `connect.tenfold.nz`) for the linking page.
3. Optionally set the redirect/return URL back to
   `https://tenfold.nz/<workspace>/settings/social`.

Result: the customer clicks **Connect your socials** in Tenfold, lands on a page
that looks like Tenfold, authorises their own social accounts, and returns — with
no third-party branding anywhere in the journey. Same principle elsewhere: never
surface the underlying providers (fal.ai, the model vendors, Ayrshare) in
customer-facing copy — promote **Tenfold**.
