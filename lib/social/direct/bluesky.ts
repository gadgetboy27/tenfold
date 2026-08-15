import sharp from "sharp";

// Bluesky / AT Protocol. The cheapest network we can publish to: no developer
// app, no review queue, no platform fees. The user creates an *app password*
// (Settings → App Passwords in the Bluesky client) and pastes it here — that is
// the whole connect flow, which is why there is no OAuth callback route for it.
//
// App passwords are revocable and scoped, so storing one is materially safer
// than storing a real account password, but it is still a credential: it lives
// in social_profiles.access_token alongside the Meta page tokens and must never
// be returned to the client (see app/api/social/profiles/route.ts, which
// selects columns explicitly and omits it).

const PDS = "https://bsky.social";

// The PDS rejects blobs over 1MB (976.56KB, enforced server-side as
// BlobTooLarge). Our generated assets routinely exceed that at full
// resolution, so images are re-encoded down to fit rather than failing the
// post. Kept a little under the true ceiling to leave room for the multipart
// framing.
const MAX_BLOB_BYTES = 950_000;

// Bluesky counts 300 *graphemes*, not UTF-16 code units — emoji and combining
// marks count as one. Intl.Segmenter gives us the real count.
const MAX_POST_GRAPHEMES = 300;

interface BlueskySession {
  accessJwt: string;
  did: string;
}

interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

/**
 * Exchange a handle + app password for a short-lived session. Called per
 * publish rather than cached: the session JWT lives ~2h, and a publish is rare
 * enough that a fresh handshake is cheaper than storing and refreshing one.
 */
export async function createBlueskySession(
  identifier: string,
  appPassword: string,
): Promise<BlueskySession> {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  const data = (await res.json()) as {
    accessJwt?: string;
    did?: string;
    message?: string;
  };
  if (!res.ok || !data.accessJwt || !data.did) {
    // The PDS says "Invalid identifier or password" for both a wrong handle and
    // a revoked app password — pass its wording through so the user knows to go
    // regenerate one rather than wondering if we're broken.
    throw new Error(data.message ?? "Bluesky sign-in failed");
  }
  return { accessJwt: data.accessJwt, did: data.did };
}

/** Verify credentials at connect time and resolve the canonical handle/DID. */
export async function verifyBlueskyCredentials(
  identifier: string,
  appPassword: string,
): Promise<{ did: string; handle: string }> {
  const session = await createBlueskySession(identifier, appPassword);
  const res = await fetch(
    `${PDS}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(session.did)}`,
  );
  const data = (await res.json()) as { handle?: string };
  return { did: session.did, handle: data.handle ?? identifier };
}

/**
 * Shrink an image until it fits the blob ceiling. Steps quality down first
 * (cheap, preserves dimensions), then dimensions — a 1080×1350 post image at
 * q60 is still perfectly legible in-feed, whereas halving the width twice is
 * visible.
 */
async function fitImageForBlob(input: Buffer): Promise<Buffer> {
  if (input.byteLength <= MAX_BLOB_BYTES) return input;

  for (const quality of [80, 65, 50]) {
    const out = await sharp(input).jpeg({ quality }).toBuffer();
    if (out.byteLength <= MAX_BLOB_BYTES) return out;
  }
  for (const width of [1440, 1080, 800]) {
    const out = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 65 })
      .toBuffer();
    if (out.byteLength <= MAX_BLOB_BYTES) return out;
  }
  throw new Error(
    "Image is too large for Bluesky even after compression (1MB limit)",
  );
}

async function uploadBlob(
  session: BlueskySession,
  bytes: Buffer,
  mimeType: string,
): Promise<BlobRef> {
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(bytes),
  });
  const data = (await res.json()) as { blob?: BlobRef; message?: string };
  if (!res.ok || !data.blob) {
    throw new Error(data.message ?? "Bluesky media upload failed");
  }
  return data.blob;
}

function truncateToGraphemes(text: string, limit: number): string {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
  if (graphemes.length <= limit) return text;
  return graphemes.slice(0, limit - 1).join("") + "…";
}

/**
 * Post an image or video with a caption. Returns the AT-URI record key, which
 * is what publish_records stores as the platform-native post id.
 */
export async function publishToBluesky(params: {
  identifier: string;
  appPassword: string;
  mediaUrl: string;
  caption: string;
  isVideo: boolean;
}): Promise<string> {
  const session = await createBlueskySession(
    params.identifier,
    params.appPassword,
  );

  const mediaRes = await fetch(params.mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`Could not fetch media for Bluesky (${mediaRes.status})`);
  }
  const raw = Buffer.from(await mediaRes.arrayBuffer());

  let embed: Record<string, unknown>;
  if (params.isVideo) {
    // Video blobs go up untouched — we can't transcode here, and Bluesky's
    // video ceiling (~50MB) is generous enough that our clips fit. An oversize
    // clip surfaces as the PDS's own BlobTooLarge message.
    const blob = await uploadBlob(session, raw, "video/mp4");
    embed = {
      $type: "app.bsky.embed.video",
      video: blob,
      // Alt text is an accessibility requirement, not decoration; reuse the
      // caption so screen-reader users get the same context as everyone else.
      alt: truncateToGraphemes(params.caption, 1000),
    };
  } else {
    const fitted = await fitImageForBlob(raw);
    const blob = await uploadBlob(session, fitted, "image/jpeg");
    const meta = await sharp(fitted).metadata();
    embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: blob,
          alt: truncateToGraphemes(params.caption, 1000),
          ...(meta.width && meta.height
            ? { aspectRatio: { width: meta.width, height: meta.height } }
            : {}),
        },
      ],
    };
  }

  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: truncateToGraphemes(params.caption, MAX_POST_GRAPHEMES),
        createdAt: new Date().toISOString(),
        embed,
      },
    }),
  });
  const data = (await res.json()) as { uri?: string; message?: string };
  if (!res.ok || !data.uri) {
    throw new Error(data.message ?? "Bluesky post failed");
  }
  return data.uri;
}
