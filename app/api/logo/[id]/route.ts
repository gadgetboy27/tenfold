import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/flags";

// GET /api/logo/:id — the project, its jobs' status, and its logo assets
// (concepts, refined, finalized), tenant-scoped. The UI polls this.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const { id } = await ctx.params;
    const admin = createSupabaseAdminClient();

    const { data: project } = await admin
      .from("logo_projects")
      .select("id, brief, anchor_asset_id, final_asset_id, status, created_at")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Logo assets carry metadata.logo_project_id — filter to this project.
    const { data: assets } = await admin
      .from("assets")
      .select("id, url, storage_path, metadata, created_at")
      .eq("workspace_id", session.workspaceId)
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
    const { data: jobs } = await admin
      .from("creative_jobs")
      .select("id, type, status, error_message, created_at, input_params")
      .eq("workspace_id", session.workspaceId)
      .eq("input_params->>logoProjectId", id)
      .order("created_at", { ascending: true });

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
      finalized: rows.filter((a) => a.metadata?.logo_stage === "logo_finalize"),
      // Free client-side edits saved as new versions (Phase 2).
      edited: rows.filter((a) => a.metadata?.logo_stage === "logo_edit"),
      // Contextual mockup scenes (Phase 3b).
      mockups: rows.filter((a) => a.metadata?.logo_stage === "logo_mockups"),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}

// DELETE /api/logo/:id — permanently remove a logo project and its assets
// (storage files + rows), tenant-scoped. Lets users clear out old/failed
// projects and start fresh. The FK from logo_projects to its assets is
// ON DELETE SET NULL, so delete order is safe.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await getSession(req);
    const { id } = await ctx.params;
    const admin = createSupabaseAdminClient();

    // Ownership check first — never delete another workspace's project.
    const { data: project } = await admin
      .from("logo_projects")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Remove the project's asset files from storage, then the rows.
    const { data: assets } = await admin
      .from("assets")
      .select("storage_path")
      .eq("workspace_id", session.workspaceId)
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
    await admin
      .from("assets")
      .delete()
      .eq("workspace_id", session.workspaceId)
      .eq("metadata->>logo_project_id", id);

    await admin
      .from("logo_projects")
      .delete()
      .eq("id", id)
      .eq("workspace_id", session.workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
