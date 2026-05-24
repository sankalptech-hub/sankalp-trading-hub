import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { AppTour, shouldShowTour } from '@/components/AppTour';

const ProtectedLayout = () => {
  const { session, loading } = useAuth();
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (session && shouldShowTour()) {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [session]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-primary font-mono text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border px-4">
            <SidebarTrigger className="mr-4" />
            <span className="font-mono text-xs text-muted-foreground">TRADESPHERE · TRADE · INVEST · PROSPER</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
              onClick={() => setTourOpen(true)}
            >
              <HelpCircle className="h-3.5 w-3.5" /> App Tour
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <AppTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </SidebarProvider>
  );
};

export default ProtectedLayout;
