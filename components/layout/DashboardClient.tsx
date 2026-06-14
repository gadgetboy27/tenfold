"use client";

import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import TopBar from "./TopBar";
import LeftRail from "./LeftRail";
import RightPanel from "./RightPanel";
import FloatingPromptBar from "./FloatingPromptBar";
import StepView from "./StepView";
import CampaignLobby from "./CampaignLobby";
import FeedbackWidget from "@/components/feedback/FeedbackWidget";

interface Props {
  workspaceSlug: string;
  user: User;
}

export default function DashboardClient({ workspaceSlug, user }: Props) {
  const { setWorkspaceSlug, setCreditBalance, currentCampaignId } =
    useAppStore();

  useEffect(() => {
    setWorkspaceSlug(workspaceSlug);
  }, [workspaceSlug, setWorkspaceSlug]);

  useEffect(() => {
    api("/api/credits/balance", { workspaceSlug })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (typeof d.balance === "number") setCreditBalance(d.balance);
      })
      .catch(() => {});
  }, [workspaceSlug, setCreditBalance]);

  // No active campaign → show lobby
  if (!currentCampaignId) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <TopBar user={user} showBack={false} />
        <div className="flex-1 overflow-hidden">
          <CampaignLobby />
        </div>
        <FeedbackWidget />
      </div>
    );
  }

  // Campaign active → show the 5-step workflow
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <TopBar user={user} showBack />
      <main className="flex-1 relative overflow-hidden">
        <StepView />
        <FloatingPromptBar />
      </main>
      {/* Overlay drawers — position:fixed, don't affect flex layout */}
      <LeftRail />
      <RightPanel />
      <FeedbackWidget />
    </div>
  );
}
