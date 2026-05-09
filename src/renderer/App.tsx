import React from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MarketplacesProvider } from './contexts/MarketplacesContext';
import { BooksProvider } from './contexts/BooksContext';
import { GlobalFiltersProvider } from './contexts/GlobalFiltersContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainLayout } from './components/MainLayout';
import { LoginScreen } from './components/LoginScreen';
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
  if (status === 'unauthenticated') return <LoginScreen />;
  return <MainLayout />;
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <MarketplacesProvider>
              <BooksProvider>
                <GlobalFiltersProvider>
                  <Gate />
                </GlobalFiltersProvider>
              </BooksProvider>
            </MarketplacesProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nextProvider>
  </ErrorBoundary>
);
