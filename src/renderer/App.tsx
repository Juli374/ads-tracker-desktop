import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { MarketplacesProvider } from './contexts/MarketplacesContext';
import { GlobalFiltersProvider } from './contexts/GlobalFiltersContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainLayout } from './components/MainLayout';
import { TokenPasteScreen } from './components/TokenPasteScreen';
import { Loader2 } from 'lucide-react';

const Gate: React.FC = () => {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <Loader2 size={18} className="animate-spin text-zinc-400" />
      </div>
    );
  }
  if (status === 'unauthenticated') return <TokenPasteScreen />;
  return <MainLayout />;
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        <MarketplacesProvider>
          <GlobalFiltersProvider>
            <Gate />
          </GlobalFiltersProvider>
        </MarketplacesProvider>
      </AuthProvider>
    </ToastProvider>
  </ErrorBoundary>
);
