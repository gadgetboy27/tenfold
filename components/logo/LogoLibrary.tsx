"use client";

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
}

export function LogoLibrary({ projects, onOpen }: LogoLibraryProps) {
  if (projects.length === 0) return null;

  return (
    <div className="mx-auto mb-10 max-w-xl space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Your logos</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="group flex flex-col overflow-hidden rounded-xl border text-left transition hover:border-primary/50"
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
        ))}
      </div>
    </div>
  );
}
