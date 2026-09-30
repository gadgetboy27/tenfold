import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverPages, getBusinessPages } from "@/lib/social/meta";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

function mockGraph(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const hit = Object.keys(routes).find((k) => url.includes(k));
      return json(
        hit ? routes[hit] : { error: { message: `no route ${url}` } },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Facebook page discovery", () => {
  it("adds business-owned Pages that /me/accounts leaves out", async () => {
    mockGraph({
      "/me/accounts": {
        data: [
          { id: "1", name: "Personal", access_token: "t1", category: "x" },
        ],
      },
      "/me/businesses": { data: [{ id: "b1", name: "Biz" }] },
      "/b1/owned_pages": {
        data: [
          { id: "2", name: "Owned", access_token: "t2", category: "y" },
          { id: "1", name: "Personal", access_token: "dup", category: "x" },
        ],
      },
      "/b1/client_pages": { data: [{ id: "3", name: "Client" }] },
      "/3?fields": { id: "3", name: "Client", access_token: "t3" },
    });
    const pages = await discoverPages("user");
    expect(pages.map((p) => p.id).sort()).toEqual(["1", "2", "3"]);
    // the personal entry wins over the business duplicate
    expect(pages.find((p) => p.id === "1")?.access_token).toBe("t1");
    expect(pages.find((p) => p.id === "3")?.access_token).toBe("t3");
  });

  it("drops a Page it cannot get a token for", async () => {
    mockGraph({
      "/me/businesses": { data: [{ id: "b1" }] },
      "/b1/owned_pages": { data: [{ id: "9", name: "Locked" }] },
      "/b1/client_pages": { data: [] },
      "/9?fields": { id: "9", name: "Locked" },
    });
    expect(await getBusinessPages("user")).toEqual([]);
  });

  it("falls back to /me/accounts alone when the business call is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGraph({
      "/me/accounts": {
        data: [{ id: "1", name: "Personal", access_token: "t1", category: "" }],
      },
      "/me/businesses": {
        error: { message: "(#200) Requires business_management" },
      },
    });
    const pages = await discoverPages("user");
    expect(pages.map((p) => p.id)).toEqual(["1"]);
  });
});
