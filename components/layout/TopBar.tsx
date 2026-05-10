'use client';

import { useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAppStore } from '@/store/useAppStore';
import CreditMeter from '@/components/shared/CreditMeter';
import JobStatusIndicator from '@/components/shared/JobStatusIndicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Pen, LogOut, User as UserIcon, Share2, ChevronLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';

interface Props {
  user: User;
  showBack?: boolean;
}

export default function TopBar({ user, showBack = false }: Props) {
  const { campaignName, setCampaignName, isGenerating, currentCampaignId, workspaceSlug, resetCampaign } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(campaignName);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = user.email ? user.email.slice(0, 2).toUpperCase() : 'TF';

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(campaignName);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      setCampaignName(trimmed);
      if (currentCampaignId && currentCampaignId !== '__new__') {
        api(`/api/campaigns/${currentCampaignId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed }),
          workspaceSlug,
        }).catch(() => {});
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') setIsEditing(false);
  };

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleDeleteCampaign = async () => {
    if (!currentCampaignId || currentCampaignId === '__new__') return;
    setDeleteStep('deleting');
    try {
      await api(`/api/campaigns/${currentCampaignId}`, { method: 'DELETE', workspaceSlug });
      resetCampaign();
    } catch {
      setDeleteStep('idle');
    }
  };

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-3 w-64">
        {showBack ? (
          <button
            onClick={resetCampaign}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-serif font-bold text-xl text-foreground">Tenfold</span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary mb-0.5 inline-block"></span>
          </button>
        ) : (
          <span className="font-serif font-bold text-xl text-foreground flex items-center gap-1.5">
            Tenfold
            <span className="w-1.5 h-1.5 rounded-full bg-primary mb-0.5 inline-block"></span>
          </span>
        )}
      </div>

      <div className="flex-1 flex justify-center items-center">
        {showBack && (
          isGenerating ? (
            <div className="flex items-center gap-2 text-sm text-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block"></span>
              Generating assets...
            </div>
          ) : (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-secondary cursor-pointer transition-colors group"
              onClick={handleEdit}
              data-testid="text-campaign-name"
            >
              {isEditing ? (
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  className="h-7 w-48 text-sm bg-background border-primary px-2"
                />
              ) : (
                <>
                  <span className="text-sm font-medium text-foreground">{campaignName}</span>
                  <Pen className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </div>
          )
        )}
      </div>

      <div className="flex items-center justify-end gap-4 w-64">
        {showBack && <JobStatusIndicator />}
        <CreditMeter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="w-8 h-8 border border-border cursor-pointer hover:border-primary/50 transition-colors">
              <AvatarFallback className="bg-secondary text-foreground text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card border-border">
            {user.email && (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-border" />
              </>
            )}
            <DropdownMenuItem className="gap-2 text-sm cursor-pointer" asChild>
              <Link href={`/${useAppStore.getState().workspaceSlug}/settings/social`}>
                <Share2 className="w-4 h-4" /> Social connections
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-sm cursor-pointer" disabled>
              <UserIcon className="w-4 h-4" /> Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            {showBack && currentCampaignId && currentCampaignId !== '__new__' && (
              <>
                <DropdownMenuSeparator className="bg-border" />
                {deleteStep === 'idle' && (
                  <DropdownMenuItem
                    className="gap-2 text-sm text-muted-foreground focus:text-destructive cursor-pointer"
                    onSelect={e => { e.preventDefault(); setDeleteStep('confirm'); }}
                  >
                    <Trash2 className="w-4 h-4" /> Delete campaign
                  </DropdownMenuItem>
                )}
                {deleteStep === 'confirm' && (
                  <div className="px-2 py-2 space-y-2">
                    <p className="text-xs text-muted-foreground">Delete &ldquo;{campaignName}&rdquo;?</p>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setDeleteStep('idle')}
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
                {deleteStep === 'deleting' && (
                  <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin inline-block" />
                    Deleting…
                  </div>
                )}
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
