import { describe, it, expect, vi, beforeEach } from "vitest";
import { imageLayerSchema } from "@/lib/composition/layers";

/**
 * Render quality through the REAL export route. High (2×) multiplies the
 * server's render work, so it is a plan feature — and the route used to accept
 * any 1–3× from anyone signed in. These pin the gate, that a Standard render
 * pays for no extra lookup, and that the doc RENDERED can differ from the doc
 * SAVED (a High render redraws stickers at 2×; the saved recipe must stay the
 * editable ad).
 */
const WS = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = "22222222-2222-4222-8222-222222222222";
const DOC_ID = "33333333-3333-4333-8333-333333333333";

let hdExport: boolean;
const entLookups: string[] = [];
const rendered: Array<Record<string, unknown>> = [];
const fanned: Array<Record<string, unknown>> = [];
const assetRows: Array<Record<string, unknown>> = [];

function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "order", "limit", "upsert"])
    b[m] = () => b;
  b.insert = (row: Record<string, unknown>) => {
    assetRows.push(row);
    return Promise.resolve({ error: null });
  };
  b.maybeSingle = () => Promise.resolve(result);
  b.single = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => res({ error: null });
  return b;
}

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ userId: "u-1", workspaceId: WS, role: "member" }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: () => "k",
  checkRateLimit: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (t: string) =>
      t === "campaigns"
        ? builder({ data: { id: CAMPAIGN }, error: null })
        : builder({ data: null, error: null }),
    rpc: () => undefined,
    storage: {},
  }),
}));
vi.mock("@/lib/billing/entitlements", () => ({
  getEntitlements: async (ws: string) => {
    entLookups.push(ws);
    return { hdExport };
  },
}));
vi.mock("@/lib/composition/export", () => ({
  renderComposition: async (input: Record<string, unknown>) => {
    rendered.push(input);
    return { url: "https://x/out.mp4", storagePath: "p.mp4", durationSec: 10 };
  },
  renderFanOut: async (input: Record<string, unknown>, aspects: string[]) => {
    fanned.push(input);
    return aspects.map((aspect) => ({
      aspect,
      url: `https://x/${aspect}.mp4`,
      storagePath: `${aspect}.mp4`,
      durationSec: 10,
    }));
  },
}));

const sticker = (scale: number) =>
  imageLayerSchema.parse({
    id: "s1",
    kind: "image",
    src: "data:image/png;base64,AAAA",
    pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
    sticker: { text: "SALE", font: "Anton", weight: 700, color: "#ffffff" },
    scale,
  });
const mkDoc = (scale = 1) => ({
  id: DOC_ID,
  aspect: "9:16",
  background: {
    kind: "image",
    src: "https://example.com/bg.jpg",
    durationSec: 10,
  },
  layers: [sticker(scale)],
});
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const exportRoute = async (body: unknown) =>
  (await import("@/app/api/compositions/export/route")).POST(post(body));

beforeEach(() => {
  hdExport = false;
  for (const a of [entLookups, rendered, fanned, assetRows]) a.length = 0;
});

describe("the plan gate", () => {
  it("a Standard render pays for no entitlement lookup", async () => {
    const res = await exportRoute({ doc: mkDoc() });
    expect(res.status).toBe(201);
    expect(entLookups).toEqual([]);
    expect(rendered[0]).toMatchObject({ scale: 1 });
  });

  it("an explicit Standard (1) is also free of the lookup", async () => {
    await exportRoute({ doc: mkDoc(), scale: 1 });
    expect(entLookups).toEqual([]);
  });

  it("High on a plan without it: 403, an upgrade prompt, and no render", async () => {
    const res = await exportRoute({ doc: mkDoc(), scale: 2 });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(rendered).toEqual([]);
  });

  it("High on a plan that has it renders at 2×", async () => {
    hdExport = true;
    const res = await exportRoute({ doc: mkDoc(), scale: 2 });
    expect(res.status).toBe(201);
    expect(rendered[0]).toMatchObject({ scale: 2 });
    expect(entLookups).toEqual([WS]);
  });

  it("the gate covers 'render every shape' too", async () => {
    const res = await exportRoute({
      doc: mkDoc(),
      aspects: ["9:16", "1:1"],
      scale: 2,
    });
    expect(res.status).toBe(403);
    expect(fanned).toEqual([]);
  });

  it("a Pro plan can fan out at High", async () => {
    hdExport = true;
    const res = await exportRoute({
      doc: mkDoc(),
      aspects: ["9:16", "1:1"],
      scale: 2,
    });
    expect(res.status).toBe(201);
    expect(fanned[0]).toMatchObject({ scale: 2 });
  });
});

describe("only Standard and High are accepted", () => {
  it.each([3, 2.5, 1.5, 0, -1, 4])(
    "scale %s is refused, even on a Pro plan",
    async (scale) => {
      hdExport = true;
      const res = await exportRoute({ doc: mkDoc(), scale });
      expect(res.status).toBe(400);
      expect(rendered).toEqual([]);
    },
  );
});

describe("the doc rendered vs the doc saved", () => {
  it("renders renderDoc, but saves doc as the recipe", async () => {
    hdExport = true;
    const stage = mkDoc(0.8); // what the user built
    const sharp = mkDoc(0.4); // stickers redrawn 2×, scale halved
    const res = await exportRoute({
      doc: stage,
      renderDoc: sharp,
      scale: 2,
      campaignId: CAMPAIGN,
    });
    expect(res.status).toBe(201);
    expect(
      (rendered[0].doc as { layers: Array<{ scale: number }> }).layers[0].scale,
    ).toBe(0.4);
    const saved = assetRows.find((r) => r.type === "composed_video")!;
    const recipe = (
      saved.metadata as { doc: { layers: Array<{ scale: number }> } }
    ).doc;
    expect(recipe.layers[0].scale).toBe(0.8); // reopening gives back the editable ad
  });

  it("renders doc itself when no renderDoc is sent", async () => {
    await exportRoute({ doc: mkDoc(0.8) });
    expect(
      (rendered[0].doc as { layers: Array<{ scale: number }> }).layers[0].scale,
    ).toBe(0.8);
  });

  it("refuses a renderDoc whose sources the server can't fetch", async () => {
    hdExport = true;
    const bad = mkDoc(0.4);
    (bad.layers[0] as { src: string }).src = "blob:http://localhost/abc";
    const res = await exportRoute({
      doc: mkDoc(0.8),
      renderDoc: bad,
      scale: 2,
    });
    expect(res.status).toBe(400);
    expect(rendered).toEqual([]);
  });

  it("refuses a malformed renderDoc", async () => {
    hdExport = true;
    const res = await exportRoute({
      doc: mkDoc(),
      renderDoc: { nope: true },
      scale: 2,
    });
    expect(res.status).toBe(400);
  });
});

describe("what is recorded about the render", () => {
  it("a Standard asset is the design size, with no quality mark", async () => {
    await exportRoute({ doc: mkDoc(), campaignId: CAMPAIGN });
    const a = assetRows.find((r) => r.type === "composed_video")!;
    expect([a.width_px, a.height_px]).toEqual([1080, 1920]);
    expect((a.metadata as Record<string, unknown>).scale).toBeUndefined();
  });

  it("a High asset records its REAL pixel size and that it was High", async () => {
    hdExport = true;
    await exportRoute({ doc: mkDoc(), scale: 2, campaignId: CAMPAIGN });
    const a = assetRows.find((r) => r.type === "composed_video")!;
    expect([a.width_px, a.height_px]).toEqual([2160, 3840]);
    expect((a.metadata as Record<string, unknown>).scale).toBe(2);
  });
});
