'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Share2, Palette, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: 'social',  label: 'Social Connections', icon: Share2 },
  { href: 'brand',   label: 'Brand Kit',           icon: Palette },
  { href: 'billing', label: 'Billing',              icon: CreditCard },
];

export default function SettingsNav({ workspace }: { workspace: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-52 border-r border-border bg-card shrink-0 p-4 space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const fullHref = `/${workspace}/settings/${href}`;
        const active = pathname === fullHref || pathname.startsWith(`${fullHref}/`);
        return (
          <Link
            key={href}
            href={fullHref}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              active
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
