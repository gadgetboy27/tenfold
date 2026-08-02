/**
 * The domain outbound transactional mail is sent FROM.
 *
 * This is deliberately separate from the brand/site domain (prettymuch.nz).
 * Resend will only accept a `from:` address on a domain that has been verified
 * in the Resend dashboard with its DNS records published — as of the
 * prettymuch.nz rename, only `tenfold.nz` is verified, so hardcoding the new
 * domain here would have every password-reset and feedback email rejected at
 * send time rather than failing loudly at deploy.
 *
 * So: sender domain is config, not code. Once prettymuch.nz is verified in
 * Resend, set `EMAIL_SENDER_DOMAIN=prettymuch.nz` in Railway — no redeploy of
 * this file needed. The default stays on the currently verified domain.
 *
 * Note this governs SENDING only. The support/contact addresses shown in the
 * footer, terms and privacy pages are prettymuch.nz mailboxes the user reads —
 * receiving mail needs no Resend verification.
 */
const VERIFIED_FALLBACK = "tenfold.nz";

export function senderDomain(): string {
  return process.env.EMAIL_SENDER_DOMAIN?.trim() || VERIFIED_FALLBACK;
}

/** `noreply@<verified domain>`, optionally with a display name. */
export function senderAddress(mailbox: string, displayName?: string): string {
  const address = `${mailbox}@${senderDomain()}`;
  return displayName ? `${displayName} <${address}>` : address;
}
