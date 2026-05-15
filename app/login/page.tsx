'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPassword, sendMagicLink } from './actions';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [waitedLong, setWaitedLong] = useState(false);
  const router = useRouter();

  // Listen for auth session — handles same-browser tab and cross-tab clicks
  useEffect(() => {
    if (!magicSent) return;
    const supabase = createSupabaseBrowserClient();

    // Auth state change fires when any tab in this browser completes the magic link
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        const { data: members } = await supabase
          .from('workspace_members')
          .select('workspaces!inner(slug)')
          .eq('user_id', session.user.id)
          .limit(1);
        const slug = (members?.[0] as unknown as { workspaces: { slug: string }[] } | undefined)
          ?.workspaces?.[0]?.slug ?? session.user.id;
        router.push(`/${slug}`);
      }
    });

    // After 90s show the "signed in elsewhere?" hint
    const timer = setTimeout(() => setWaitedLong(true), 90_000);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, [magicSent, router]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      if (mode === 'password') {
        const result = await signInWithPassword(formData);
        if (result?.error) setError(result.error);
      } else {
        const result = await sendMagicLink(formData);
        if (result?.error) setError(result.error);
        else if (result?.success) setMagicSent(true);
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-serif font-bold text-3xl text-foreground flex items-center justify-center gap-2">
            Tenfold
            <span className="w-2 h-2 rounded-full bg-primary mb-0.5 inline-block" />
          </span>
          <p className="mt-2 text-muted-foreground text-sm">Sign in to your workspace</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
          {magicSent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-medium text-foreground mb-2">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to your inbox. If you click it in this browser, you&apos;ll be signed in automatically.
              </p>

              {waitedLong && (
                <div className="mt-4 p-3 bg-secondary rounded-lg text-left">
                  <p className="text-xs text-muted-foreground mb-2">
                    Clicked the link on another device? Sign in with your password to continue here.
                  </p>
                  <button
                    onClick={() => { setMagicSent(false); setMode('password'); setWaitedLong(false); }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Switch to password sign in →
                  </button>
                </div>
              )}

              <button
                onClick={() => { setMagicSent(false); setWaitedLong(false); }}
                className="mt-4 text-xs text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-5 bg-secondary rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setMode('password')}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === 'password' ? 'bg-card text-foreground font-medium' : 'text-muted-foreground'}`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setMode('magic')}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${mode === 'magic' ? 'bg-card text-foreground font-medium' : 'text-muted-foreground'}`}
                >
                  Magic Link
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>

                {mode === 'password' && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Password</label>
                    <input
                      type="password"
                      name="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending
                    ? 'Please wait…'
                    : mode === 'password'
                    ? 'Sign In'
                    : 'Send Magic Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
