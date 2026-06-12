'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { resolveWorkspacePath } from '@/lib/auth/workspace-redirect';
import { Card } from '@/components/ui/card';

type EmailOtpType = 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change' | 'email';

/**
 * Client-side OAuth / magic-link / email-confirm callback.
 *
 * Runs in the browser so it can read BOTH the PKCE `?code=` query (server could
 * read this) AND the implicit-flow `#access_token=` URL fragment (the server
 * NEVER receives the hash — that was the `missing_code` bug). The Supabase
 * browser client's detectSessionInUrl auto-processes both; we just wait for the
 * session, then provision the workspace and redirect.
 */
export default function CallbackHandler() {
  const router = useRouter();
  const ran = useRef(false);
  const [msg, setMsg] = useState('Signing you in…');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        router.replace('/login?error=auth_unavailable');
        return;
      }

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token');
        const type = url.searchParams.get('type');
        const providerError =
          url.searchParams.get('error_description') ?? url.searchParams.get('error');

        // Provider returned an explicit error (e.g. user cancelled consent).
        if (providerError && !code && !tokenHash) {
          router.replace('/login?error=' + encodeURIComponent(providerError));
          return;
        }

        // detectSessionInUrl auto-handles `?code` (PKCE) and `#access_token`
        // (implicit). Legacy magic links use `?token_hash` → verify explicitly.
        if (!code && tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });
          if (error) throw error;
        }

        // Wait for the session to materialise (URL processing is async).
        let session = null;
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            session = data.session;
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!session) {
          router.replace('/login?error=auth_failed');
          return;
        }

        setMsg('Setting up your workspace…');
        const slug = (session.user.user_metadata?.workspace_slug as string | undefined) ?? null;
        router.replace(await resolveWorkspacePath(slug));
      } catch {
        router.replace('/login?error=auth_failed');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <Card className="w-full max-w-md p-8 bg-white shadow-2xl text-center">
        <p className="text-gray-600">{msg}</p>
      </Card>
    </div>
  );
}
