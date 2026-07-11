"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Sparkles,
  Crosshair,
  Layers,
  PenTool,
  Eye,
  Send,
  Check,
  Settings,
  Image as ImageIcon,
  Film,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1 as const, label: "Create", icon: Sparkles },
  { id: 2 as const, label: "Select", icon: Crosshair },
  { id: 3 as const, label: "Expand", icon: Layers },
  { id: 4 as const, label: "Compose", icon: PenTool },
  { id: 5 as const, label: "Review", icon: Eye },
  { id: 6 as const, label: "Publish", icon: Send },
];

export default function LeftRail() {
  const {
    currentStep,
    completedSteps,
    setStep,
    creditBalance,
    workspaceSlug,
    leftDrawerOpen,
    setLeftDrawerOpen,
  } = useAppStore();

  const MAX = 500;
  const pct = Math.min(100, Math.round((creditBalance / MAX) * 100));
  const barColor =
    pct < 20 ? "#EF4444" : pct < 50 ? "#F59E0B" : "var(--color-primary)";

  return (
    <AnimatePresence>
      {leftDrawerOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setLeftDrawerOpen(false)}
          />
          <motion.aside
            className="fixed left-0 top-0 bottom-0 w-52 bg-card border-r border-border flex flex-col z-50 shadow-2xl"
            initial={{ x: -208 }}
            animate={{ x: 0 }}
            exit={{ x: -208 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="h-12 flex items-center justify-between px-4 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Navigation
              </span>
              <button
                onClick={() => setLeftDrawerOpen(false)}
                className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <nav className="space-y-1 relative">
                <div className="absolute left-6 top-6 bottom-6 w-px bg-border -z-10" />
                {STEPS.map((step) => {
                  const isCompleted = completedSteps.has(step.id);
                  const isCurrent = currentStep === step.id;
                  const isLocked =
                    !isCompleted && !isCurrent && step.id > currentStep;
                  const Icon = isCompleted && !isCurrent ? Check : step.icon;
                  return (
                    <button
                      key={step.id}
                      onClick={() => {
                        if (!isLocked) {
                          setStep(step.id);
                          setLeftDrawerOpen(false);
                        }
                      }}
                      disabled={isLocked}
                      className={cn(
                        "w-full flex items-center gap-3 px-2 py-3 rounded-lg text-sm font-medium transition-all group",
                        isCurrent ? "text-primary" : "text-muted-foreground",
                        !isLocked && !isCurrent
                          ? "hover:text-foreground hover:bg-secondary"
                          : "",
                        isLocked
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer",
                      )}
                      data-testid={`nav-step-${step.id}`}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center bg-card border-2 transition-colors relative z-10",
                          isCurrent ? "border-primary text-primary" : "",
                          isCompleted && !isCurrent
                            ? "border-success bg-success/10 text-success"
                            : "",
                          !isCurrent && !isCompleted
                            ? "border-border bg-card group-hover:border-muted-foreground"
                            : "",
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span>{step.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {workspaceSlug && (
              <div className="px-3 pb-2 space-y-1">
                <Link
                  href={`/${workspaceSlug}/productions`}
                  onClick={() => setLeftDrawerOpen(false)}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-border bg-card shrink-0">
                    <Film className="w-4 h-4" />
                  </div>
                  <span>Productions</span>
                </Link>
                <Link
                  href={`/${workspaceSlug}/gallery`}
                  onClick={() => setLeftDrawerOpen(false)}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-border bg-card shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span>Gallery</span>
                </Link>
                <Link
                  href={`/${workspaceSlug}/settings/social`}
                  onClick={() => setLeftDrawerOpen(false)}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-border bg-card shrink-0">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span>Settings</span>
                </Link>
              </div>
            )}

            <div className="p-4 border-t border-border shrink-0">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex justify-between">
                <span>Credits</span>
                <span className="text-foreground">{creditBalance} left</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
