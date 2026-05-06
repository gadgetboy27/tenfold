'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Hexagon, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const PACKS = [
  { label: '100 credits', credits: 100, priceId: 'price_100', display: '$9' },
  { label: '500 credits', credits: 500, priceId: 'price_500', display: '$39' },
  { label: '2000 credits', credits: 2000, priceId: 'price_2000', display: '$129' },
];

export default function CreditMeter() {
  const { creditBalance, workspaceSlug, setCreditBalance } = useAppStore();
  const [open, setOpen] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [topping, setTopping] = useState(false);

  const isLow     = creditBalance < 50;
  const isWarning = creditBalance >= 50 && creditBalance < 150;

  const handleTopUp = async () => {
    setTopping(true);
    try {
      const res = await api('/api/dev/grant-credits', { method: 'POST', workspaceSlug });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? 'Top-up failed'); }
      const { granted } = await res.json() as { granted: number };
      setCreditBalance(creditBalance + granted);
      toast.success(`+${granted} credits added`);
      setOpen(false);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not add credits');
    } finally {
      setTopping(false);
    }
  };

  const handlePurchase = async (priceId: string) => {
    setPurchasing(priceId);
    try {
      const res = await api('/api/credits/purchase', { method: 'POST', body: JSON.stringify({ priceId }), workspaceSlug });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? `Purchase failed (${res.status})`); }
      const { url } = await res.json() as { url: string };
      if (url) { setOpen(false); window.location.href = url; }
      else throw new Error('No checkout URL returned');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not start checkout');
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card hover:bg-secondary transition-colors',
            isLow ? 'border-red-500/60 text-red-400' : isWarning ? 'border-amber-500/60 text-amber-400' : 'border-border text-foreground',
          )}
          data-testid="button-credits"
        >
          <Hexagon className="w-4 h-4" />
          <span className="font-mono text-sm font-medium">{creditBalance}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 bg-card border-border p-4 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Hexagon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Credits</h3>
            <p className={cn('text-sm font-mono font-semibold', isLow ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-foreground')}>
              {creditBalance} available
            </p>
          </div>
        </div>

        {isLow && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            Running low — top up to keep generating.
          </div>
        )}

        <button
          onClick={handleTopUp}
          disabled={topping}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-sm mb-4 disabled:opacity-50"
        >
          <span className="text-primary font-medium">+ 200 test credits</span>
          {topping && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        </button>

        <div className="space-y-2 mb-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Top up</p>
          {PACKS.map(pack => (
            <button
              key={pack.priceId}
              onClick={() => handlePurchase(pack.priceId)}
              disabled={!!purchasing}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm disabled:opacity-50"
            >
              <span className="font-medium text-foreground">{pack.label}</span>
              <span className="flex items-center gap-2">
                {purchasing === pack.priceId && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                <span className="text-primary font-semibold">{pack.display}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground gap-2 text-sm">
            <Clock className="w-4 h-4" /> View Transaction History
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
