'use client';

import { useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAppStore } from '@/store/useAppStore';
import CreditMeter from '@/components/shared/CreditMeter';
import JobStatusIndicator from '@/components/shared/JobStatusIndicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Pen, LogOut, User as UserIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  user: User;
}

export default function TopBar({ user }: Props) {
  const { campaignName, setCampaignName, isGenerating } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(campaignName);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = user.email ? user.email.slice(0, 2).toUpperCase() : 'TF';

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(campaignName);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = () => {
    if (editValue.trim()) setCampaignName(editValue);
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

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-3 w-64">
        <span className="font-serif font-bold text-xl text-foreground flex items-center gap-1.5">
          Tenfold
          <span className="w-1.5 h-1.5 rounded-full bg-primary mb-0.5 inline-block"></span>
        </span>
      </div>

      <div className="flex-1 flex justify-center items-center">
        {isGenerating ? (
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
        )}
      </div>

      <div className="flex items-center justify-end gap-4 w-64">
        <JobStatusIndicator />
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
            <DropdownMenuItem className="gap-2 text-sm cursor-pointer" disabled>
              <UserIcon className="w-4 h-4" /> Account settings
            </DropdownMenuItem>
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
