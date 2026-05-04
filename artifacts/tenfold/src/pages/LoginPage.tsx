import React, { useState } from 'react';
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

  // Redirect if already authenticated
  if (session || isDevBypass) {
    setLocation('/app');
    return null;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-serif font-bold text-2xl">
              T
            </div>
            <h1 className="font-serif text-4xl text-foreground font-bold tracking-tight">Tenfold</h1>
          </div>
          <h2 className="text-2xl text-foreground font-medium">Sign in to your workspace</h2>
          <p className="text-muted-foreground mt-2">Enter your credentials to access the platform</p>
        </div>

        <form onSubmit={handleSignIn} className="bg-card border border-border p-8 rounded-2xl space-y-6 shadow-2xl">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background border-border text-foreground h-12"
              required
              data-testid="input-email"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-foreground">Password</Label>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background border-border text-foreground h-12"
              required
              data-testid="input-password"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-base rounded-lg transition-all"
            disabled={loading || !supabase}
            data-testid="button-submit"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </Button>

          {!supabase && (
            <div className="pt-4 border-t border-border mt-6">
              <p className="text-sm text-muted-foreground text-center mb-4">
                No Supabase URL configured.
              </p>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-12 border-primary/50 text-primary hover:bg-primary/10"
                onClick={() => {
                  devBypassLogin();
                  setLocation('/app');
                }}
                data-testid="button-dev-bypass"
              >
                [Dev Mode] Enter App
              </Button>
            </div>
          )}
        </form>

        <p className="text-center text-muted-foreground text-sm">
          Don't have an account? <a href="#" className="text-primary hover:underline">Start free trial</a>
        </p>
      </div>
    </div>
  );
}
