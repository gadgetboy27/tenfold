"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Gift, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface RedeemCodeProps {
  workspaceSlug: string;
  onRedeemed?: () => void | Promise<unknown>;
}

export default function RedeemCode({ workspaceSlug, onRedeemed }: RedeemCodeProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      const res = await api("/api/credits/redeem", {
        method: "POST",
        body: JSON.stringify({ code: c }),
        workspaceSlug,
      });
      const d = (await res.json().catch(() => ({}))) as {
        credits?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(d.error ?? "Couldn't redeem that code.");
        return;
      }
      toast.success(`${d.credits} credits added 🎉`);
      setCode("");
      await onRedeemed?.();
    } catch {
      toast.error("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Have a code?</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Redeem a promo or friends-and-family code for free credits.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && redeem()}
          placeholder="ENTER CODE"
          maxLength={64}
          disabled={busy}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono uppercase tracking-wide outline-none focus:border-primary disabled:opacity-50"
        />
        <Button onClick={redeem} disabled={busy || !code.trim()} className="gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Redeem
        </Button>
      </div>
    </div>
  );
}
