"use client";

import { Fragment, useState, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { useAppStore } from "@/store/useAppStore";
import CreditMeter from "@/components/shared/CreditMeter";
import ProBadge from "@/components/billing/ProBadge";
import JobStatusIndicator from "@/components/shared/JobStatusIndicator";
import FeedbackWidget from "@/components/feedback/FeedbackWidget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pen,
  LogOut,
  User as UserIcon,
  Share2,
  ChevronLeft,
  Trash2,
  Sparkles,
  Crosshair,
  Layers,
  PenTool,
  Eye,
  Send,
  Check,
  PanelLeft,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import toast from "react-hot-toast";

const STEPS = [
  { id: 1 as const, label: "Create", icon: Sparkles },
  { id: 2 as const, label: "Select", icon: Crosshair },
  { id: 3 as const, label: "Expand", icon: Layers },
  { id: 4 as const, label: "Compose", icon: PenTool },
  { id: 5 as const, label: "Review", icon: Eye },
  { id: 6 as const, label: "Publish", icon: Send },
];

interface Props {
  user: User;
  showBack?: boolean;
}

export default function TopBar({ user, showBack = false }: Props) {
  const {
    campaignName,
    setCampaignName,
    isGenerating,
    currentCampaignId,
    workspaceSlug,
    resetCampaign,
    currentStep,
    completedSteps,
    setStep,
    leftDrawerOpen,
    setLeftDrawerOpen,
    rightDrawerOpen,
    setRightDrawerOpen,
    setCreditBalance,
  } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(campaignName);
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "deleting">(
    "idle",
  );
  const [isGranting, setIsGranting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = user.email ? user.email.slice(0, 2).toUpperCase() : "TF";

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(campaignName);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      setCampaignName(trimmed);
      if (currentCampaignId && currentCampaignId !== "__new__") {
        api(`/api/campaigns/${currentCampaignId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: trimmed }),
          workspaceSlug,
        }).catch(() => {});
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") setIsEditing(false);
  };

  const handleGrantCredits = async () => {
    setIsGranting(true);
    try {
      const res = await api("/api/dev/grant-credits", {
        method: "POST",
        workspaceSlug,
      });
      const data = (await res.json()) as { granted?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Grant failed");
      toast.success(`+${data.granted} test credits added`);
      // Refresh displayed balance
      api("/api/credits/balance", { workspaceSlug })
        .then((r) => r.json())
        .then((d: { balance?: number }) => {
          if (typeof d.balance === "number") setCreditBalance(d.balance);
        })
        .catch(() => {});
    } catch (err) {
      toast.error((err as Error).message ?? "Could not grant credits");
    } finally {
      setIsGranting(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleDeleteCampaign = async () => {
    if (!currentCampaignId || currentCampaignId === "__new__") return;
    setDeleteStep("deleting");
    try {
      await api(`/api/campaigns/${currentCampaignId}`, {
        method: "DELETE",
        workspaceSlug,
      });
      resetCampaign();
    } catch {
      setDeleteStep("idle");
    }
  };

  return (
    <header className="h-12 flex items-center px-4 border-b border-border bg-card shrink-0 gap-3">
      {/* LEFT: logo / back + campaign name + left-panel toggle */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {showBack ? (
          <>
            <button
              onClick={resetCampaign}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors group shrink-0"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <Logo size={20} withWordmark />
            </button>

            <span className="text-border text-sm select-none">/</span>

            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-secondary cursor-pointer transition-colors group min-w-0"
              onClick={!isEditing ? handleEdit : undefined}
              data-testid="text-campaign-name"
            >
              {isEditing ? (
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  className="h-6 w-36 text-sm bg-background border-primary px-2 py-0"
                />
              ) : (
                <>
                  <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                    {campaignName}
                  </span>
                  <Pen className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </>
              )}
            </div>

            <button
              onClick={() => setLeftDrawerOpen(!leftDrawerOpen)}
              className={cn(
                "p-1.5 rounded transition-colors shrink-0",
                leftDrawerOpen
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
              title="Navigation"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <Logo size={24} withWordmark className="shrink-0" />
        )}
      </div>

      {/* CENTER: step pills or generating indicator */}
      <div className="flex-1 flex justify-center items-center min-w-0">
        {showBack &&
          (isGenerating ? (
            <div className="flex items-center gap-2 text-sm text-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Generating assets...
            </div>
          ) : (
            <div className="flex items-center">
              {STEPS.map((step, idx) => {
                const isCompleted = completedSteps.has(step.id);
                const isCurrent = currentStep === step.id;
                const isLocked =
                  !isCompleted && !isCurrent && step.id > currentStep;

                return (
                  <Fragment key={step.id}>
                    <button
                      onClick={() => !isLocked && setStep(step.id)}
                      disabled={isLocked}
                      title={step.label}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full text-xs font-medium transition-all",
                        isCurrent
                          ? "bg-primary/10 text-primary px-2.5 py-1"
                          : "p-1",
                        !isLocked && !isCurrent
                          ? "hover:bg-secondary cursor-pointer"
                          : "",
                        isLocked ? "opacity-35 cursor-not-allowed" : "",
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                          isCurrent ? "bg-primary text-primary-foreground" : "",
                          isCompleted && !isCurrent
                            ? "bg-success/20 text-success"
                            : "",
                          !isCurrent && !isCompleted
                            ? "border border-border text-muted-foreground"
                            : "",
                        )}
                      >
                        {isCompleted && !isCurrent ? (
                          <Check className="w-2.5 h-2.5" />
                        ) : (
                          step.id
                        )}
                      </span>
                      {isCurrent && <span>{step.label}</span>}
                    </button>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={cn(
                          "w-3 h-px mx-0.5 shrink-0",
                          completedSteps.has(step.id)
                            ? "bg-success/40"
                            : "bg-border",
                        )}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
          ))}
      </div>

      {/* RIGHT: job status + settings panel toggle + credits + avatar */}
      <div className="flex items-center gap-2.5 shrink-0">
        <FeedbackWidget />
        {showBack && <JobStatusIndicator />}

        {showBack && (
          <button
            onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
            className={cn(
              "p-1.5 rounded transition-colors",
              rightDrawerOpen
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
            title="Settings panel"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        )}

        <ProBadge />
        <CreditMeter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="w-7 h-7 border border-border cursor-pointer hover:border-primary/50 transition-colors">
              <AvatarFallback className="bg-secondary text-foreground text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 bg-card border-border"
          >
            {user.email && (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <DropdownMenuSeparator className="bg-border" />
              </>
            )}
            <DropdownMenuItem className="gap-2 text-sm cursor-pointer" asChild>
              <Link
                href={`/${useAppStore.getState().workspaceSlug}/settings/social`}
              >
                <Share2 className="w-4 h-4" /> Social connections
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-sm cursor-pointer" disabled>
              <UserIcon className="w-4 h-4" /> Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            {showBack &&
              currentCampaignId &&
              currentCampaignId !== "__new__" && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  {deleteStep === "idle" && (
                    <DropdownMenuItem
                      className="gap-2 text-sm text-muted-foreground focus:text-destructive cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                        setDeleteStep("confirm");
                      }}
                    >
                      <Trash2 className="w-4 h-4" /> Delete campaign
                    </DropdownMenuItem>
                  )}
                  {deleteStep === "confirm" && (
                    <div className="px-2 py-2 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Delete &ldquo;{campaignName}&rdquo;?
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setDeleteStep("idle")}
                        >
                          Cancel
                        </button>
                        <button
                          className="flex-1 text-xs px-2 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors"
                          onClick={handleDeleteCampaign}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                  {deleteStep === "deleting" && (
                    <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                      Deleting…
                    </div>
                  )}
                </>
              )}
            {process.env.NODE_ENV !== "production" && (
              <>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="gap-2 text-sm text-amber-400 focus:text-amber-400 cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    handleGrantCredits();
                  }}
                  disabled={isGranting}
                >
                  <Zap className="w-4 h-4" />
                  {isGranting ? "Adding…" : "Top up 500 credits (dev)"}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="gap-2 text-sm text-red-400 focus:text-red-400 cursor-pointer"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
