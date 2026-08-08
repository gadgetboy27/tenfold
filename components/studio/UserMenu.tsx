"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, User, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Account menu for Studio's header — who you're signed in as, and a way out.
 *
 * Studio replaced the classic dashboard but never inherited `TopBar`, which was
 * the only place a sign-out existed. So the main site had no way to log out at
 * all, and no indication of which account you were using. That's a problem in
 * its own right, and worse here because this workspace has several accounts
 * (`iamgadgetboy@`, `henrypeti.dev@`, two Taylin addresses) whose credit
 * balances differ wildly — being signed in as the wrong one looks exactly like
 * missing credits.
 *
 * Sign-out clears local session state before redirecting, so a stale or
 * half-written session can't survive into the next sign-in.
 */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const signOut = async () => {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // `local` scope clears this browser's stored session even if the network
      // call fails — otherwise a failed sign-out leaves you apparently logged
      // in with a session the server has already dropped.
      if (supabase) await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* still redirect — being stuck signed in is worse */
    } finally {
      window.location.href = "/login";
    }
  };

  const initial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={email ?? "Account"}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground transition-colors hover:border-primary/50"
      >
        {email ? initial : <User className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Signed in as
            </p>
            {/* Shown deliberately: with several accounts on this product, the
                wrong one is indistinguishable from missing credits. */}
            <p className="truncate text-sm font-medium text-foreground">
              {email ?? "Loading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-background disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
