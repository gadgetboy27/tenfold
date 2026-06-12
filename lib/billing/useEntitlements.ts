"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import type { Entitlements } from "@/lib/billing/entitlements";

/** Fetch the active workspace's plan entitlements (for Pro gating + upgrade CTAs). */
export function useEntitlements(): Entitlements | null {
  const { workspaceSlug } = useAppStore();
  const [ent, setEnt] = useState<Entitlements | null>(null);

  useEffect(() => {
    let active = true;
    api("/api/entitlements", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Entitlements | null) => {
        if (active && d) setEnt(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  return ent;
}
