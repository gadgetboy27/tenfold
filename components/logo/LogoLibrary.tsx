"use client";

import { Trash2 } from "lucide-react";

// "Your logos" — past projects, newest first, to re-open (and thus re-edit /
// re-download) forever. Clicking one rehydrates the studio from server state.

export interface LogoProjectSummary {
  id: string;
  businessName: string;
  status: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  generating: "Generating…",
  selecting: "Pick a concept",
  refining: "Refining",
  finalized: "Finalized",
  packaged: "Packaged",
  briefing: "Draft",
};

interface LogoLibraryProps {
  projects: LogoProjectSummary[];
  onOpen: (id: string) => void;
  /** Delete a project (with its assets). Absent = no delete affordance. */
  onDelete?: (id: string) => void;
  /** Id currently being deleted — its card shows a busy/disabled state. */
  deletingId?: string | null;
}

export function LogoLibrary({
  projects,
  onOpen,
  onDelete,
  deletingId,
}: LogoLibraryProps) {
  if (projects.length === 0) return null;

  return (
    <div className="mx-auto mb-10 max-w-xl space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Your logos</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className={`group relative flex flex-col overflow-hidden rounded-xl border transition hover:border-primary/50 ${
              deletingId === p.id ? "opacity-50" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              disabled={deletingId === p.id}
              className="flex flex-col text-left"
            >
              <div className="flex aspect-square items-center justify-center bg-white">
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt={p.businessName}
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No preview
                  </span>
                )}
              </div>
              <div className="border-t px-3 py-2">
                <p className="truncate text-sm font-medium">{p.businessName}</p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[p.status] ?? p.status}
                </p>
              </div>
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id);
                }}
                disabled={deletingId === p.id}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition hover:bg-red-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                title="Delete this logo"
                aria-label={`Delete ${p.businessName}`}
                data-testid={`button-delete-logo-${p.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
