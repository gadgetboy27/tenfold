'use client';

import { useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import TopBar from './TopBar';
import LeftRail from './LeftRail';
import RightPanel from './RightPanel';
import FloatingPromptBar from './FloatingPromptBar';
import StepView from './StepView';

interface Props {
  workspaceSlug: string;
  user: User;
}

export default function DashboardClient({ workspaceSlug, user }: Props) {
  const { setWorkspaceSlug, setCreditBalance } = useAppStore();

  useEffect(() => {
    setWorkspaceSlug(workspaceSlug);
  }, [workspaceSlug, setWorkspaceSlug]);

  useEffect(() => {
    api('/api/credits/balance', { workspaceSlug })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (typeof d.balance === 'number') setCreditBalance(d.balance);
      })
      .catch(() => {});
  }, [workspaceSlug, setCreditBalance]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <TopBar user={user} />
      <div className="flex flex-1 overflow-hidden">
        <LeftRail />
        <main className="flex-1 relative overflow-hidden">
          <StepView />
          <FloatingPromptBar />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
