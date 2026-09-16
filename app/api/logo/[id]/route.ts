import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { isEnabled } from "@/lib/flags";
import { reclaimLogoJobs } from "@/lib/logo/reclaim";

// GET /api/logo/:id — the project, its jobs' status, and its logo assets
// (concepts, refined, finalized), tenant-scoped. The UI polls this.
//
// The poll is also the delivery fallback: any job still processing past the
// point fal has usually finished is checked against fal's queue directly and
// its result saved here, because waiting on fal's webhook alone has meant
// 30–60s (once 75 minutes) between a rendered concept and the user seeing
// it. See lib/logo/reclaim.ts for the measurements.
export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, admin, params }) => {
    if (!isEnabled("logoBuilder")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { id } = params;

    const { data: project } = await db
      .from("logo_projects")
      .select("id, brief, anchor_asset_id, final_asset_id, status, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Jobs first: a late-webhook reclaim below can add assets, and the asset
    // query must run after it or this response would be one poll behind.
    const jobSelect = () =>
      db
        .from("creative_jobs")
        .select(
          "id, campaign_id, workspace_id, type, status, error_message, credits_charged, created_at, input_params, fal_request_id, fal_raw_error",
        )
        .eq("input_params->>logoProjectId", id)
        .order("created_at", { ascending: true });
    let { data: jobs } = await jobSelect();
    if (await reclaimLogoJobs(admin, jobs ?? [])) {
      ({ data: jobs } = await jobSelect());
    }

    // Logo assets carry metadata.logo_project_id — filter to this project.
    const { data: assets } = await db
      .from("assets")
      .select("id, url, storage_path, metadata, created_at")
      .eq("type", "image")
      .eq("metadata->>logo_project_id", id)
      .order("created_at", { ascending: true });

    const rows = (assets ?? []) as Array<{
      id: string;
      url: string;
      metadata: { logo_stage?: string } | null;
      created_at: string;
    }>;

    // This route's contract has always claimed to return "its jobs' status",
    // but never actually selected them — so a failed concepts job was
    // invisible to the poller, which sat on "Generating… 0 of 6 ready"
    // forever with no way to learn why. Every logo job tags itself with
    // input_params.logoProjectId (see app/api/logo/route.ts and siblings).
    return NextResponse.json({
      project,
      jobs: (jobs ?? []).map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        errorMessage: j.error_message,
        createdAt: j.created_at,
        // How many fal requests this job is waiting on. The 6 concepts are one
        // job across 6 requests, and partial submit failure is tolerated at
        // creation time — so "expected" can legitimately be under 6, and the
        // UI must not wait for images that were never submitted.
        expectedImages:
          Number(
            (j.input_params as { expected_images?: number } | null)
              ?.expected_images ?? 0,
          ) || null,
      })),
      concepts: rows.filter((a) => a.metadata?.logo_stage === "logo_concepts"),
      refined: rows.filter((a) => a.metadata?.logo_stage === "logo_refine"),
      /**
       * The finished mark.
       *
       * `final_asset_id` FIRST, because it is the project's own answer and the
       * stage tag is only a description of how the asset was made. An IMPORTED
       * logo is tagged `logo_vectorize`, so a stage-only filter returned an
       * empty `finalized` for it — and the client derives `displayAnchor` from
       * that, so the UI fell through to the concepts grid and sat on
       * "Generating… 0 of 6 ready" indefinitely for a project that was already
       * done. Measured: 21 seconds of work, still "generating" eight minutes
       * later, then a stall notice claiming spent credits for a job that had
       * succeeded.
       *
       * Both sources, deduped: the id catches whatever the project actually
       * points at however it was produced, and the stage tags keep earlier
       * finalize runs listed alongside it.
       */
      finalized: rows.filter(
        (a) =>
          a.id === project.final_asset_id ||
          a.metadata?.logo_stage === "logo_finalize" ||
          a.metadata?.logo_stage === "logo_vectorize",
      ),
      // Free client-side edits saved as new versions (Phase 2).
      edited: rows.filter((a) => a.metadata?.logo_stage === "logo_edit"),
      // Contextual mockup scenes (Phase 3b).
      mockups: rows.filter((a) => a.metadata?.logo_stage === "logo_mockups"),
    });
  },
  { rateLimit: false },
);

// DELETE /api/logo/:id — permanently remove a logo project and its assets
// (storage files + rows), tenant-scoped. Lets users clear out old/failed
// projects and start fresh. The FK from logo_projects to its assets is
// ON DELETE SET NULL, so delete order is safe.
export const DELETE = withWorkspace<{ id: string }>(
  async (_req, { db, admin, params }) => {
    if (!isEnabled("logoBuilder")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { id } = params;

    // Ownership check first — never delete another workspace's project.
    const { data: project } = await db
      .from("logo_projects")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Remove the project's asset files from storage, then the rows.
    const { data: assets } = await db
      .from("assets")
      .select("storage_path")
      .eq("metadata->>logo_project_id", id);
    const paths = (assets ?? [])
      .map((a) => (a as { storage_path: string | null }).storage_path)
      .filter((p): p is string => !!p);
    if (paths.length) {
      await admin.storage
        .from("assets")
        .remove(paths)
        .catch(() => {});
    }
    await db.from("assets").delete().eq("metadata->>logo_project_id", id);

    await db.from("logo_projects").delete().eq("id", id);

    return NextResponse.json({ ok: true });
  },
);
