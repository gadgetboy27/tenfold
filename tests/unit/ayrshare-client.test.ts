import { describe, it, expect, vi, afterEach } from "vitest";
import { ayrsharePost, AyrsharePublishError } from "@/lib/ayrshare/client";

/**
 * Every fixture below is a VERBATIM response captured from the live Ayrshare
 * API, not from its documentation. That distinction is the whole point: the
 * published docs describe a top-level `id` with `postIds[]` and `errors[]`,
 * and the API returns none of those — it returns `posts[]`. Coding to the docs
 * is why this integration recorded the literal string "posted" for every
 * publish, success and failure alike, and nobody noticed for months.
 *
 * If these ever fail, re-capture against the real API before trusting the docs.
 */

function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

const send = () =>
  ayrsharePost("pk", { post: "hi", platforms: ["linkedin"], mediaUrls: ["u"] });

afterEach(() => vi.unstubAllGlobals());

describe("ayrsharePost — against the real response contract", () => {
  it("returns the post id on an immediate success", async () => {
    respond({
      status: "success",
      posts: [
        {
          status: "success",
          id: "as2gwzrWyRBWtICTQmwB",
          refId: "0e5389ee",
          profileTitle: "iamgadgetboy",
        },
      ],
      validate: true,
    });
    await expect(send()).resolves.toEqual({
      id: "as2gwzrWyRBWtICTQmwB",
      scheduled: false,
    });
  });

  it("returns the post id on a scheduled success, flagged as scheduled", async () => {
    // Captured live. The social network's own id does not exist yet — Ayrshare's
    // id is the handle used to cancel it, which is what we must store.
    respond({
      status: "success",
      posts: [
        {
          status: "scheduled",
          scheduleDate: "2026-07-19T09:12:40Z",
          id: "K3VmZTnJ7zR3V98Xaj9K",
          refId: "0e5389ee",
          profileTitle: "iamgadgetboy",
        },
      ],
      validate: true,
    });
    await expect(send()).resolves.toEqual({
      id: "K3VmZTnJ7zR3V98Xaj9K",
      scheduled: true,
    });
  });

  it("throws on a failure that arrives as HTTP 200", async () => {
    // Captured live. HTTP 200, status "error" — `if (!res.ok)` never fires.
    respond({
      status: "error",
      posts: [
        {
          action: "post",
          status: "error",
          code: 164,
          message:
            "Error accessing the media. Please verify the media URL is accessible",
          details: "The mediaUrls field is incorrect.",
          profileTitle: "iamgadgetboy",
        },
      ],
      validate: true,
    });
    await expect(send()).rejects.toBeInstanceOf(AyrsharePublishError);
  });

  it("tells the user what to fix, joining message and details", async () => {
    // "Error accessing the media" alone is not actionable; the details name the
    // offending field. Both, or the user is left guessing.
    respond({
      status: "error",
      posts: [
        {
          status: "error",
          code: 164,
          message: "Error accessing the media.",
          details: "The mediaUrls field is incorrect.",
        },
      ],
    });
    await expect(send()).rejects.toThrow(
      "Error accessing the media. The mediaUrls field is incorrect.",
    );
    await expect(send()).rejects.toMatchObject({
      code: 164,
      platform: "linkedin",
    });
  });

  it("throws when the entry errors even though the envelope says success", async () => {
    respond({
      status: "success",
      posts: [
        { status: "error", code: 110, message: "Status is a duplicate." },
      ],
    });
    await expect(send()).rejects.toThrow("Status is a duplicate.");
  });

  it("never invents an id when Ayrshare returns none", async () => {
    // The old code's `?? "posted"` fallback lived here — it wrote a fake id and
    // reported success. Nothing is better than a lie.
    respond({ status: "success", posts: [{ status: "success" }] });
    await expect(send()).rejects.toThrow(/returned no id/i);
  });

  it("does not mistake the documented-but-absent fields for an outcome", async () => {
    // If Ayrshare ever DID return the documented shape, there is still no
    // `posts` entry to trust, so this must fail loudly rather than guess.
    respond({ status: "success", postIds: [], errors: [], id: "req-1" });
    await expect(send()).rejects.toBeInstanceOf(AyrsharePublishError);
  });

  it("still reports real HTTP errors", async () => {
    respond(
      {
        status: "error",
        posts: [{ status: "error", message: "Invalid API key" }],
      },
      401,
    );
    await expect(send()).rejects.toThrow("Invalid API key");
  });

  it("does not crash on an unreadable body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      })),
    );
    await expect(send()).rejects.toBeInstanceOf(AyrsharePublishError);
  });
});
