"use client";

import { ImageIcon, Type, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { useCompositorStore } from "@/store/useCompositorStore";

/** Layer stack, front-most first. Select, reorder, delete. */
export function LayerList() {
  const doc = useCompositorStore((s) => s.doc);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const selectLayer = useCompositorStore((s) => s.selectLayer);
  const moveLayer = useCompositorStore((s) => s.moveLayer);
  const removeLayer = useCompositorStore((s) => s.removeLayer);

  if (!doc) return null;
  if (doc.layers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No layers yet — add your logo or a caption.
      </p>
    );
  }

  // Render front-most (last in array) at the top of the list.
  const stack = [...doc.layers].reverse();

  return (
    <div className="space-y-1">
      {stack.map((layer) => {
        const active = layer.id === selectedLayerId;
        return (
          <div
            key={layer.id}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
              active
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border hover:border-primary/30"
            }`}
          >
            <button
              onClick={() => selectLayer(layer.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              {layer.kind === "image" ? (
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Type className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">
                {layer.kind === "text" ? layer.text : "Image / logo"}
              </span>
            </button>
            <button
              onClick={() => moveLayer(layer.id, "up")}
              title="Bring forward"
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => moveLayer(layer.id, "down")}
              title="Send backward"
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => removeLayer(layer.id)}
              title="Delete layer"
              className="text-muted-foreground hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
