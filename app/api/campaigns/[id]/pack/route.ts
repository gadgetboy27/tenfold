import { NextResponse } from "next/server";
import JSZip from "jszip";
import { withWorkspace } from "@/lib/api/with-workspace";

/**
 * GET /api/campaigns/:id/pack — everything this campaign made, in one zip.
 *
 * The product could publish and it could render, and between those two there
 * was no way to simply KEEP the work. "Send it to my web designer", "upload it
 * somewhere else later", "put it on the website" all had the same answer:
 * right-click each asset in turn and hope you got them all.
 *
 * Free, and deliberately so. Every file here is one the workspace has already
 * paid to generate; charging to collect them into a folder would be charging
 * twice for the same pixels.
 *
 * Streams from Storage and zips in memory. That is fine at campaign scale — a
 * campaign is tens of files, not thousands — and it keeps this a single request
 * with no job row, no webhook and no polling. If a campaign ever grows large
 * enough for that to hurt, the fix is a job + a stored zip like the logo
 * bundle, not a bigger buffer here.
 */

/** Where each asset type goes, so the zip explains itself in the file tree. */
function folderFor(type: string, branded: boolean): string {
  if (type === "audio") return "audio";
  if (type === "video" || type === "composed_video")
    return branded ? "finished/video" : "source/clips";
  return branded ? "finished/images" : "source/images";
}

function extFor(type: string, url: string): string {
  const fromUrl = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (fromUrl && fromUrl.length <= 4) return fromUrl;
  if (type === "audio") return "mp3";
  if (type.includes("video")) return "mp4";
  return "png";
}

export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, session, params }) => {
    const { data: campaign } = await db
      .from("campaigns")
      .select("id, name, created_at")
      .eq("id", params.id)
      .maybeSingle();
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const camp = campaign as { id: string; name: string; created_at: string };

    const { data: rows } = await db
      .from("assets")
      .select("id, url, type, metadata, created_at")
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: true });

    const assets = (
      (rows ?? []) as {
        id: string;
        url: string;
        type: string;
        metadata: { hd?: boolean; kind?: string } | null;
        created_at: string;
      }[]
    ).filter(
      // The normalised frame a video was generated from is a working copy of
      // the anchor, resized to fit a provider limit — including it hands the
      // recipient two near-identical files and no way to tell them apart.
      (a) => a.metadata?.kind !== "video_source" && !a.metadata?.hd,
    );

    if (assets.length === 0) {
      return NextResponse.json(
        { error: "Nothing to pack yet — make something first." },
        { status: 400 },
      );
    }

    const zip = new JSZip();
    const manifest: string[] = [
      `# ${camp.name}`,
      ``,
      `Everything this campaign produced, exported ${new Date().toISOString().slice(0, 10)}.`,
      ``,
      `- finished/  — rendered, ready to post or hand over`,
      `- source/    — the generations the finished work was built from`,
      `- audio/     — music tracks`,
      ``,
      `## Files`,
      ``,
    ];

    let packed = 0;
    const failed: string[] = [];
    for (const a of assets) {
      const branded =
        a.type === "composed_video" || a.type === "composed_image";
      const folder = folderFor(a.type, branded);
      const name = `${folder}/${a.id.slice(0, 8)}.${extFor(a.type, a.url)}`;
      try {
        const res = await fetch(a.url);
        if (!res.ok) {
          // One dead object must not cost the other thirty files.
          failed.push(name);
          continue;
        }
        zip.file(name, Buffer.from(await res.arrayBuffer()));
        manifest.push(
          `- \`${name}\` — ${a.type}, ${a.created_at.slice(0, 10)}`,
        );
        packed++;
      } catch {
        failed.push(name);
      }
    }

    if (packed === 0) {
      return NextResponse.json(
        { error: "Could not read any of this campaign's files." },
        { status: 502 },
      );
    }
    if (failed.length) {
      manifest.push(``, `## Missing`, ``);
      // Named rather than silently absent: a short zip with no explanation is
      // worse than a short zip that says which files it could not reach.
      for (const f of failed) manifest.push(`- ${f} — could not be read`);
    }

    zip.file("README.md", manifest.join("\n"));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const safe =
      camp.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") ||
      "campaign";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${safe}.zip"`,
        "content-length": String(buffer.byteLength),
        // The contents change as the campaign does; a cached zip would hand
        // back yesterday's work with today's filename.
        "cache-control": "no-store",
        "x-pack-files": String(packed),
        "x-pack-workspace": session.workspaceId,
      },
    });
  },
);
