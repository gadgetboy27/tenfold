import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Share2, Palette, CreditCard, ArrowLeft } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}

const NAV = [
  { href: 'social',  label: 'Social Connections', icon: Share2 },
  { href: 'brand',   label: 'Brand Kit',           icon: Palette },
  { href: 'billing', label: 'Billing',              icon: CreditCard },
];

export default async function SettingsLayout({ children, params }: Props) {
  const { workspace } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Settings top bar */}
      <header className="h-14 flex items-center px-6 border-b border-border bg-card shrink-0 gap-4">
        <Link
          href={`/${workspace}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace
        </Link>
        <span className="w-px h-4 bg-border" />
        <span className="font-serif font-bold text-lg text-foreground">Settings</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Settings sidebar */}
        <aside className="w-52 border-r border-border bg-card shrink-0 p-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={`/${workspace}/settings/${href}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
