import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { session, devBypassLogin, isDevBypass } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session || isDevBypass) {
      setLocation('/app');
    }
  }, [session, isDevBypass]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      devBypassLogin();
      setLocation('/app');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setLocation('/app');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#7C5CFC] rounded-xl flex items-center justify-center text-white font-bold text-2xl" style={{ fontFamily: 'Syne, sans-serif' }}>
              T
            </div>
            <h1 className="text-4xl text-[#F0F0F0] font-bold tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>Tenfold</h1>
          </div>
          <h2 className="text-2xl text-[#F0F0F0] font-medium">Sign in to your workspace</h2>
          <p className="text-[#666] mt-2 text-sm">Enter your credentials to access the platform</p>
        </div>

        <form
          onSubmit={handleSignIn}
          className="rounded-2xl border border-white/10 p-8 space-y-6 shadow-2xl"
          style={{ background: 'rgba(20,20,20,0.8)' }}
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#CCC] text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-[#111] border-white/10 text-[#F0F0F0] h-12 placeholder-[#444]"
              required
              data-testid="input-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[#CCC] text-sm">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-[#111] border-white/10 text-[#F0F0F0] h-12"
              required
              data-testid="input-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 font-medium text-base rounded-xl"
            style={{ background: 'linear-gradient(135deg, #7C5CFC, #9D84FD)' }}
            disabled={loading}
            data-testid="button-submit"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </Button>

          {!supabase && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-[#555] text-center mb-3">Supabase not configured</p>
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-[#7C5CFC]/40 text-[#9D84FD] hover:bg-[#7C5CFC]/10"
                onClick={() => { devBypassLogin(); setLocation('/app'); }}
                data-testid="button-dev-bypass"
              >
                Dev Mode — Enter App
              </Button>
            </div>
          )}
        </form>

        <p className="text-center text-[#555] text-sm">
          Don't have an account? <a href="#" className="text-[#7C5CFC] hover:underline">Start free trial</a>
        </p>
      </div>
    </div>
  );
}
