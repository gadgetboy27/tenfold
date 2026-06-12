import CallbackHandler from '@/components/auth/CallbackHandler';

// Alias of /auth/callback so Supabase configs pointing at /callback also work.
export default function CallbackAliasPage() {
  return <CallbackHandler />;
}
