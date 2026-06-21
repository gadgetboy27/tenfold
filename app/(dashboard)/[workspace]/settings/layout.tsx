import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SettingsNav from "./SettingsNav";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}

export default async function SettingsLayout({ children, params }: Props) {
  const { workspace } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 flex items-center px-6 border-b border-border bg-card shrink-0 gap-4">
        <Link
          href={`/${workspace}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace
        </Link>
        <span className="w-px h-4 bg-border" />
        <span className="font-serif font-bold text-lg text-foreground">
          Settings
        </span>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <SettingsNav workspace={workspace} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
