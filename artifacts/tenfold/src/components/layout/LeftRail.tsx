import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Sparkles, Crosshair, Layers, PenTool, Send, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, label: 'Create', icon: Sparkles },
  { id: 2, label: 'Select', icon: Crosshair },
  { id: 3, label: 'Expand', icon: Layers },
  { id: 4, label: 'Compose', icon: PenTool },
  { id: 5, label: 'Publish', icon: Send },
];

export default function LeftRail() {
  const { currentStep, completedSteps, setStep } = useAppStore();

  return (
    <aside className="w-40 border-r border-border bg-card flex flex-col shrink-0">
      <div className="p-4 flex-1">
        <nav className="space-y-1 relative">
          {/* Vertical connection line */}
          <div className="absolute left-6 top-6 bottom-6 w-px bg-border -z-10" />

          {STEPS.map((step) => {
            const isCompleted = completedSteps.has(step.id);
            const isCurrent = currentStep === step.id;
            const isLocked = !isCompleted && !isCurrent && step.id > currentStep;
            
            const Icon = isCompleted && !isCurrent ? Check : step.icon;

            return (
              <button
                key={step.id}
                onClick={() => !isLocked && setStep(step.id as any)}
                disabled={isLocked}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-3 rounded-lg text-sm font-medium transition-all group",
                  isCurrent ? "text-primary" : "text-muted-foreground",
                  !isLocked && !isCurrent ? "hover:text-foreground hover:bg-secondary" : "",
                  isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                )}
                data-testid={`nav-step-${step.id}`}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center bg-card border-2 transition-colors relative z-10",
                  isCurrent ? "border-primary text-primary" : "",
                  isCompleted && !isCurrent ? "border-success bg-success/10 text-success" : "",
                  !isCurrent && !isCompleted ? "border-border bg-card group-hover:border-muted-foreground" : ""
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-border mt-auto">
        <div className="text-xs font-medium text-muted-foreground mb-2 flex justify-between">
          <span>Usage</span>
          <span className="text-foreground">62%</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary w-[62%] rounded-full" />
        </div>
      </div>
    </aside>
  );
}
