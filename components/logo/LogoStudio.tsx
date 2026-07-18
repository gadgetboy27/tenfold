"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { LogoBrief } from "./LogoBrief";
import { LogoConceptGrid, type LogoAsset } from "./LogoConceptGrid";
import { LogoRefine } from "./LogoRefine";
import { LogoEditor } from "./LogoEditor";
import type { LogoBrief as LogoBriefType } from "@/lib/logo/brief";

// The studio orchestrator. Holds the one piece of durable state — the project
// id — and polls GET /api/logo/:id for assets as fal webhooks land them. Phases
// are derived from the project's status + which assets exist, so a refresh
// mid-flow rehydrates correctly from the server rather than local state.

interface ProjectState {
  project: {
    id: string;
    status: string;
    anchor_asset_id: string | null;
    final_asset_id: string | null;
  };
  concepts: LogoAsset[];
  refined: LogoAsset[];
  finalized: LogoAsset[];
  edited: LogoAsset[];
  mockups: LogoAsset[];
}

const POLL_MS = 2500;

export function LogoStudio() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [expected, setExpected] = useState(6);
  const [state, setState] = useState<ProjectState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const [expectedMockups, setExpectedMockups] = useState(0);
  const [brandApplied, setBrandApplied] = useState(false);
  const [bundle, setBundle] = useState<{
    downloadUrl: string;
    fileCount: number;
  } | null>(null);
  const params = useParams();
  const workspaceSlug =
    typeof params?.workspace === "string" ? params.workspace : "";
  const [brandPalette, setBrandPalette] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The workspace brand palette powers "apply brand palette" in the editor.
  // Fetched once from the existing brand-kit endpoint; absent kit → no button.
  useEffect(() => {
    fetch("/api/brand-kit")
      .then((r) => (r.ok ? r.json() : null))
      .then((kit) => {
        if (!kit) return;
        const palette = [
          kit.primary_color,
          kit.secondary_color,
          kit.accent_color,
        ].filter(
          (c): c is string =>
            typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c),
        );
        setBrandPalette(palette);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/logo/${id}`);
    if (!res.ok) return;
    setState((await res.json()) as ProjectState);
  }, []);

  // Poll while a project exists and isn't finalized. Cleared on unmount and
  // when the project reaches a terminal state so we don't hammer the endpoint.
  // Prime via microtask so the state update lands in a callback, not
  // synchronously in the effect body.
  useEffect(() => {
    if (!projectId) return;
    const tick = () => void refresh(projectId);
    queueMicrotask(tick);
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, refresh]);

  // Stop polling once the project is fully settled: finalized, and any
  // requested mockups have all arrived. Before finalize (concepts/refine) it
  // keeps polling for new assets.
  useEffect(() => {
    if (!state || !pollRef.current) return;
    const mockupsDone = state.mockups.length >= expectedMockups;
    if (state.finalized.length > 0 && mockupsDone) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [state, expectedMockups]);

  async function startGeneration(brief: LogoBriefType) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start");
      setExpected(data.concepts ?? 6);
      setProjectId(data.projectId as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function anchor(assetId: string) {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/anchor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorAssetId: assetId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      await refresh(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function refine(instruction: string) {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      // Restart polling — a new refine asset will arrive via webhook.
      if (!pollRef.current)
        pollRef.current = setInterval(() => void refresh(projectId), POLL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      if (!pollRef.current)
        pollRef.current = setInterval(() => void refresh(projectId), POLL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function packageLogo() {
    if (!projectId) return;
    setPackaging(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/package`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Packaging failed");
      setBundle({ downloadUrl: data.downloadUrl, fileCount: data.fileCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPackaging(false);
    }
  }

  async function useAsBrand() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/use-as-brand`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setBrandApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function runMockups() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/mockups`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setExpectedMockups(data.mockups ?? 4);
      // Mockup scenes arrive via webhook — resume polling for them.
      if (!pollRef.current)
        pollRef.current = setInterval(() => void refresh(projectId), POLL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const banner = error && (
    <div className="mx-auto mb-4 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      {error}
    </div>
  );

  // Phase 1: brief.
  if (!projectId || !state) {
    return (
      <div className="px-4 py-10">
        {banner}
        <LogoBrief onSubmit={startGeneration} submitting={submitting} />
      </div>
    );
  }

  const anchorAsset =
    state.concepts.find((c) => c.id === state.project.anchor_asset_id) ??
    state.refined.find((r) => r.id === state.project.anchor_asset_id) ??
    null;

  const finalAsset = state.finalized[0] ?? null;

  // Free editor (Phase 2): opened from the finished logo. Edits its SVG in the
  // browser and saves versions — no credits.
  if (editing && finalAsset) {
    return (
      <div className="px-4 py-10">
        {banner}
        <LogoEditor
          projectId={projectId}
          sourceUrl={finalAsset.url}
          brandPalette={brandPalette}
          onSaved={() => {
            setEditing(false);
            void refresh(projectId);
          }}
        />
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-muted-foreground underline"
          >
            Back to logo
          </button>
        </div>
      </div>
    );
  }

  // An anchor is chosen — refine / finalize / (once final) customise.
  if (anchorAsset) {
    return (
      <div className="px-4 py-10">
        {banner}
        <LogoRefine
          anchor={anchorAsset}
          refined={state.refined}
          finalized={finalAsset}
          onRefine={refine}
          onFinalize={finalize}
          onReanchor={anchor}
          onEdit={() => setEditing(true)}
          onPackage={packageLogo}
          packaging={packaging}
          bundle={bundle}
          onMockups={runMockups}
          mockups={state.mockups}
          expectedMockups={expectedMockups}
          onUseAsBrand={useAsBrand}
          brandApplied={brandApplied}
          newCampaignHref={workspaceSlug ? `/${workspaceSlug}/new` : "#"}
          busy={busy}
        />
      </div>
    );
  }

  // Phase 2: concepts landing, pick one.
  return (
    <div className="px-4 py-10">
      {banner}
      <LogoConceptGrid
        concepts={state.concepts}
        expected={expected}
        anchorId={state.project.anchor_asset_id}
        onAnchor={anchor}
        anchoring={busy}
      />
    </div>
  );
}
