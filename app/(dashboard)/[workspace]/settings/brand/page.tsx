'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { Upload, X, Save, Loader2, Check, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const FONTS = ['Inter', 'Montserrat', 'Playfair Display', 'Lora', 'Roboto'] as const;
type Font = typeof FONTS[number];

interface BrandKit {
  primary_color:   string;
  secondary_color: string;
  accent_color:    string;
  font_family:     Font;
  tagline:         string;
  logo_url:        string | null;
}

const DEFAULTS: BrandKit = {
  primary_color:   '#6366f1',
  secondary_color: '#8b5cf6',
  accent_color:    '#f59e0b',
  font_family:     'Inter',
  tagline:         '',
  logo_url:        null,
};

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
          title={label}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <Input
          value={value}
          onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
          className="h-8 font-mono text-xs bg-background"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export default function BrandKitPage() {
  const params = useParams<{ workspace: string }>();
  const workspaceSlug = params.workspace;
  const storeSlug = useAppStore(s => s.workspaceSlug);
  const slug = storeSlug || workspaceSlug;

  const [kit, setKit]           = useState<BrandKit>(DEFAULTS);
  const [saved, setSaved]       = useState<BrandKit>(DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasChanges =
    kit.primary_color   !== saved.primary_color   ||
    kit.secondary_color !== saved.secondary_color ||
    kit.accent_color    !== saved.accent_color    ||
    kit.font_family     !== saved.font_family     ||
    kit.tagline         !== saved.tagline;

  useEffect(() => {
    api('/api/brand-kit', { workspaceSlug: slug })
      .then(r => r.json())
      .then((d: Partial<BrandKit>) => {
        const merged = { ...DEFAULTS, ...d };
        setKit(merged);
        setSaved(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api('/api/brand-kit', {
        method: 'PATCH',
        workspaceSlug: slug,
        body: JSON.stringify({
          primary_color:   kit.primary_color,
          secondary_color: kit.secondary_color,
          accent_color:    kit.accent_color,
          font_family:     kit.font_family,
          tagline:         kit.tagline,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved({ ...kit });
      toast.success('Brand kit saved');
    } catch {
      toast.error('Failed to save brand kit');
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const supabase = (await import('@supabase/ssr')).createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (slug) headers['x-workspace-slug'] = slug;

      const res = await fetch('/api/brand-kit/logo', { method: 'POST', headers, body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Upload failed');
      }
      const { url } = await res.json() as { url: string };
      setKit(k => ({ ...k, logo_url: url }));
      setSaved(k => ({ ...k, logo_url: url }));
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadLogo(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) uploadLogo(f);
  };

  const removeLogo = async () => {
    setKit(k => ({ ...k, logo_url: null }));
    setSaved(k => ({ ...k, logo_url: null }));
    await api('/api/brand-kit', {
      method: 'PATCH',
      workspaceSlug: slug,
      body: JSON.stringify({ logo_url: null }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-16 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading brand kit…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-1">Brand Kit</h1>
          <p className="text-sm text-muted-foreground">
            Your logo, colours and typography applied to every exported asset.
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={saving} className="gap-2 shrink-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-8">
        {/* Left — form */}
        <div className="col-span-3 space-y-8">

          {/* Logo */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted-foreground" /> Logo
            </h2>
            {kit.logo_url ? (
              <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
                <div className="relative w-20 h-20 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
                  <Image src={kit.logo_url} alt="Logo" fill className="object-contain" sizes="80px" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground mb-1">Logo uploaded</p>
                  <p className="text-xs text-muted-foreground mb-3">PNG, JPG, WEBP or SVG · max 5 MB</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      Replace
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={removeLogo}>
                      <X className="w-3.5 h-3.5 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && fileRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/30',
                  uploading && 'pointer-events-none opacity-60',
                )}
              >
                {uploading
                  ? <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  : <Upload className="w-8 h-8 text-muted-foreground" />
                }
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{uploading ? 'Uploading…' : 'Drop your logo here'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP, SVG · max 5 MB</p>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={handleFileChange} />
          </section>

          {/* Colors */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" /> Brand Colours
            </h2>
            <div className="space-y-4">
              <ColorField label="Primary" value={kit.primary_color} onChange={v => setKit(k => ({ ...k, primary_color: v }))} />
              <ColorField label="Secondary" value={kit.secondary_color} onChange={v => setKit(k => ({ ...k, secondary_color: v }))} />
              <ColorField label="Accent" value={kit.accent_color} onChange={v => setKit(k => ({ ...k, accent_color: v }))} />
            </div>
          </section>

          {/* Typography */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">Typography</h2>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map(f => (
                <button
                  key={f}
                  onClick={() => setKit(k => ({ ...k, font_family: f }))}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all text-left',
                    kit.font_family === f
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border bg-card hover:border-primary/30 text-foreground',
                  )}
                >
                  {kit.font_family === f && <Check className="w-3.5 h-3.5 shrink-0" />}
                  <span style={{ fontFamily: f }}>{f}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Tagline */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">Brand Tagline</h2>
            <Input
              value={kit.tagline}
              onChange={e => setKit(k => ({ ...k, tagline: e.target.value.slice(0, 200) }))}
              placeholder="e.g. Powering the future of AI marketing"
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground mt-1.5">{kit.tagline.length}/200 · stamped on composed exports</p>
          </section>

          {hasChanges && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>

        {/* Right — preview */}
        <div className="col-span-2">
          <h2 className="text-sm font-semibold text-foreground mb-4">Preview</h2>
          <div className="sticky top-0 space-y-3">
            {/* Social post mock */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg" style={{ fontFamily: kit.font_family }}>
              {/* Post image area with brand colour overlay */}
              <div
                className="relative h-40 flex items-end p-4"
                style={{ background: `linear-gradient(135deg, ${kit.primary_color}cc, ${kit.secondary_color}cc)` }}
              >
                {kit.logo_url && (
                  <Image src={kit.logo_url} alt="" width={120} height={32} className="absolute top-3 left-3 h-8 w-auto object-contain drop-shadow-lg" />
                )}
                <div
                  className="absolute bottom-3 right-3 w-5 h-5 rounded-full"
                  style={{ background: kit.accent_color }}
                />
                <p className="text-white/90 text-xs font-medium drop-shadow" style={{ fontFamily: kit.font_family }}>
                  Generated with tenfold.nz
                </p>
              </div>
              {/* Caption area */}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: kit.primary_color }}>
                    {kit.logo_url
                      ? <Image src={kit.logo_url} alt="" width={20} height={20} className="w-5 h-5 object-contain" />
                      : <span className="text-white text-[10px] font-bold">B</span>
                    }
                  </div>
                  <span className="text-sm font-semibold text-foreground" style={{ fontFamily: kit.font_family }}>Your Brand</span>
                </div>
                {kit.tagline && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2" style={{ fontFamily: kit.font_family }}>
                    {kit.tagline}
                  </p>
                )}
                <div className="flex gap-1 flex-wrap pt-1">
                  {['#yourhashtag', '#tenfold', '#ai'].map(tag => (
                    <span key={tag} className="text-xs font-medium" style={{ color: kit.primary_color }}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Colour swatches */}
            <div className="flex gap-2">
              {[kit.primary_color, kit.secondary_color, kit.accent_color].map((c, i) => (
                <div key={i} className="flex-1 h-8 rounded-lg border border-border/50" style={{ background: c }} title={c} />
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Live preview — updates as you edit
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
