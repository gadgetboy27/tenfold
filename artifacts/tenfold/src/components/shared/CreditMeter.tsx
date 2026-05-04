import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Hexagon, CreditCard, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function CreditMeter() {
  const { creditBalance } = useAppStore();
  const [open, setOpen] = useState(false);

  const isLow = creditBalance < 50;
  const isWarning = creditBalance >= 50 && creditBalance < 150;
  const totalAllocation = 1000;
  const usagePercentage = Math.round(((totalAllocation - creditBalance) / totalAllocation) * 100);

  const handlePurchase = () => {
    toast('Redirecting to billing...', { icon: '💳' });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card hover:bg-secondary transition-colors",
          isLow ? "border-error text-error" : isWarning ? "border-warning text-warning" : "border-border text-foreground"
        )}
        data-testid="button-credits"
        >
          <Hexagon className="w-4 h-4" />
          <span className="font-mono text-sm font-medium">{creditBalance}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-card border-border p-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Hexagon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Credit Balance</h3>
            <p className="text-xs text-muted-foreground">{creditBalance} available</p>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Monthly Allocation ({totalAllocation})</span>
            <span>{usagePercentage}% used</span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                isLow ? "bg-error" : isWarning ? "bg-warning" : "bg-primary"
              )} 
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right">Renews in 12 days</p>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
            onClick={handlePurchase}
          >
            <CreditCard className="w-4 h-4" /> Buy More Credits
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground gap-2">
            <Clock className="w-4 h-4" /> View Transaction History
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
