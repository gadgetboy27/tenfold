import React, { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import CreditMeter from '../shared/CreditMeter';
import JobStatusIndicator from '../shared/JobStatusIndicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Pen } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function TopBar() {
  const { campaignName, setCampaignName, isGenerating } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(campaignName);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(campaignName);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = () => {
    if (editValue.trim()) {
      setCampaignName(editValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-3 w-64">
        <span className="font-serif font-bold text-xl text-foreground flex items-center gap-1.5">
          Tenfold
          <span className="w-1.5 h-1.5 rounded-full bg-primary mb-0.5"></span>
        </span>
      </div>

      <div className="flex-1 flex justify-center items-center">
        {isGenerating ? (
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
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
        <Avatar className="w-8 h-8 border border-border cursor-pointer">
          <AvatarFallback className="bg-secondary text-foreground text-xs font-medium">JD</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
