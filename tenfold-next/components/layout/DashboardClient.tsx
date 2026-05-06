'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import TopBar from './TopBar';
import LeftRail from './LeftRail';
import RightPanel from './RightPanel';
import StepView from './StepView';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  workspaceSlug: string;
  user: User;
}

type WorkspaceStatus = 'loading' | 'ok' | 'not_found' | 'error';

export default function DashboardClient({ workspaceSlug, user }: Props) {
  const { setWorkspaceSlug, setCreditBalance } = useAppStore();
  const [wsStatus, setWsStatus] = useState<WorkspaceStatus>('loading');

  useEffect(() => {
    setWorkspaceSlug(workspaceSlug);
  }, [workspaceSlug, setWorkspaceSlug]);

  useEffect(() => {
    api('/api/credits/balance', { workspaceSlug })
      .then((r) => {
        if (r.status === 403 || r.status === 404) {
          setWsStatus('not_found');
          return null;
        }
        if (!r.ok) {
          setWsStatus('error');
          return null;
        }
        setWsStatus('ok');
        return r.json();
      })
      .then((d: { balance?: number } | null) => {
        if (d && typeof d.balance === 'number') setCreditBalance(d.balance);
      })
      .catch(() => setWsStatus('error'));
  }, [workspaceSlug, setCreditBalance]);

  if (wsStatus === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (wsStatus === 'not_found') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background px-4 gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div className="text-center max-w-sm">
          <h2 className="font-semibold text-foreground text-lg mb-1">Workspace not found</h2>
          <p className="text-sm text-muted-foreground mb-1">
            The workspace <span className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded">{workspaceSlug}</span> doesn&apos;t exist or you don&apos;t have access.
          </p>
          <p className="text-xs text-muted-foreground mb-5">
            This usually means your session is pointing to an old test URL. Sign out and back in to be routed to your real workspace.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign out &amp; sign back in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <TopBar user={user} />
      <div className="flex flex-1 overflow-hidden">
        <LeftRail />
        <main className="flex-1 relative overflow-hidden">
          <StepView />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
