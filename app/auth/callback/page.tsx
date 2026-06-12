import CallbackHandler from '@/components/auth/CallbackHandler';

// Client-side callback (reads PKCE ?code and implicit #hash). See CallbackHandler.
export default function AuthCallbackPage() {
  return <CallbackHandler />;
}
