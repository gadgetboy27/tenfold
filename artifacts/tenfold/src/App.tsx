import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import AppPage from "@/pages/AppPage";
import { useEffect } from "react";

const queryClient = new QueryClient();

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={() => {
        // Simple redirect to /app, AuthProvider handles protection inside /app
        window.location.replace("/app");
        return null;
      }} />
      <Route path="/login" component={LoginPage} />
      <Route path="/app" component={AppPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster 
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1A1A1A',
                color: '#F0F0F0',
                border: '1px solid rgba(255,255,255,0.08)',
              },
              success: {
                iconTheme: {
                  primary: '#22C55E',
                  secondary: '#0A0A0A',
                },
              },
              error: {
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#0A0A0A',
                },
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
