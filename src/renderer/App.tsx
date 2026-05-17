import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { EntitlementsProvider } from './contexts/EntitlementsContext';
import { MarketplacesProvider } from './contexts/MarketplacesContext';
import { BooksProvider } from './contexts/BooksContext';
import { GlobalFiltersProvider } from './contexts/GlobalFiltersContext';
import { WeeksFilterProvider } from './contexts/WeeksFilterContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainLayout } from './components/MainLayout';
import { LoginScreen } from './components/LoginScreen';
import { SignupScreen } from './components/SignupScreen';
import { Loader2 } from 'lucide-react';

/**
 * Auth route surface. Lives inside Gate so we can pivot between
 * `login` / `signup` without disturbing the rest of the app. We don't
 * use react-router for this — there are exactly two unauthenticated
 * surfaces and a flat boolean toggle keeps the dependency graph small.
 */
type UnauthRoute = 'login' | 'signup';

function readInitialRoute(): UnauthRoute {
  if (typeof window === 'undefined') return 'login';
  // Hash-based "deep link" for signup. Lets the QA team open the form via
  // window.location.hash = '#signup' without juggling a router.
  if (window.location.hash === '#signup') return 'signup';
  return 'login';
}

const Gate: React.FC = () => {
  const { status } = useAuth();
  const [unauthRoute, setUnauthRoute] = useState<UnauthRoute>(() => readInitialRoute());

  if (status === 'loading') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <Loader2 size={18} className="animate-spin text-zinc-400" />
      </div>
    );
  }
  if (status === 'unauthenticated') {
    if (unauthRoute === 'signup') {
      return (
        <SignupScreen
          onSwitchToLogin={() => {
            setUnauthRoute('login');
            if (window.location.hash === '#signup') {
              history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          }}
        />
      );
    }
    return <LoginScreen onShowSignup={() => setUnauthRoute('signup')} />;
  }
  return <MainLayout />;
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <EntitlementsProvider>
              <MarketplacesProvider>
                <BooksProvider>
                  <GlobalFiltersProvider>
                    <WeeksFilterProvider>
                      <Gate />
                    </WeeksFilterProvider>
                  </GlobalFiltersProvider>
                </BooksProvider>
              </MarketplacesProvider>
            </EntitlementsProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nextProvider>
  </ErrorBoundary>
);
