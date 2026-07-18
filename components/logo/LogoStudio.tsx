"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoBrief } from "./LogoBrief";
import { LogoConceptGrid, type LogoAsset } from "./LogoConceptGrid";
import { LogoRefine } from "./LogoRefine";
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
}

const POLL_MS = 2500;

export function LogoStudio() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [expected, setExpected] = useState(6);
  const [state, setState] = useState<ProjectState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (id: string) => {
    const res = await fetch(`/api/logo/${id}`);
    if (!res.ok) return;
    setState((await res.json()) as ProjectState);
  }, []);

  // Poll while a project exists and isn't finalized. Cleared on unmount and
  // when the project reaches a terminal state so we don't hammer the endpoint.
  useEffect(() => {
    if (!projectId) return;
    void refresh(projectId);
    pollRef.current = setInterval(() => void refresh(projectId), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, refresh]);

  useEffect(() => {
    if (state?.finalized.length && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [state?.finalized.length]);

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

  // Phase 3: an anchor is chosen — refine / finalize.
  if (anchorAsset) {
    return (
      <div className="px-4 py-10">
        {banner}
        <LogoRefine
          anchor={anchorAsset}
          refined={state.refined}
          finalized={state.finalized[0] ?? null}
          onRefine={refine}
          onFinalize={finalize}
          onReanchor={anchor}
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
