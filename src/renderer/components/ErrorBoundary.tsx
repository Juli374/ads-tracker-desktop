import React from 'react';
import { AlertOctagon } from 'lucide-react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Phase I.2 Lane B: redact well-known token shapes before either logging
// to disk or showing in UI. Mirrors the main-side scrubSecrets() — kept
// inline so this module has zero IPC import-time cost (the renderer can be
// shown an error before window.api is ready).
const TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /at_live_[A-Za-z0-9_-]+/g,
  /at_test_[A-Za-z0-9_-]+/g,
  /eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}/g,
];
const BEARER_LITERAL = /Bearer\s+\S+/gi;

function scrubSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const pat of TOKEN_PATTERNS) {
    out = out.replace(pat, '***');
  }
  out = out.replace(BEARER_LITERAL, 'Bearer ***');
  return out;
}

class ErrorBoundaryClass extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep dev-time console for fast iteration.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Phase I.2 Lane B: forward to main's electron-log file transport.
    // Main scrubs again — this is best-effort defence in depth here.
    const safeMessage = scrubSecrets(error.message || 'Unknown error');
    const safeStack = error.stack ? scrubSecrets(error.stack) : undefined;
    const safeComponentStack = info.componentStack
      ? scrubSecrets(info.componentStack)
      : undefined;

    try {
      const w = window as unknown as {
        api?: {
          log?: {
            error: (message: string, ctx?: Record<string, unknown>) => Promise<void>;
          };
        };
      };
      if (w.api?.log?.error) {
        void w.api.log.error('renderer error', {
          message: safeMessage,
          stack: safeStack,
          componentStack: safeComponentStack,
        });
      }
    } catch {
      // Never let logging itself break the boundary.
    }
  }

  reload = () => {
    window.location.reload();
  };

  render() {
    const { t } = this.props;
    if (this.state.error) {
      const displayMessage = scrubSecrets(this.state.error.message || '');
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-card p-6">
            <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center mb-4">
              <AlertOctagon size={16} className="text-red-600" strokeWidth={2.2} />
            </div>
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
              {t('errorBoundary.title')}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              {t('errorBoundary.hint')}
            </p>
            <div className="mt-3 px-3 py-2 rounded-md bg-zinc-50 border border-zinc-100 text-[11px] font-mono text-zinc-700 break-all">
              {displayMessage}
            </div>
            <button
              onClick={this.reload}
              className="
                mt-4 w-full h-9 rounded-md bg-zinc-900 text-white text-sm font-medium
                hover:bg-zinc-800 transition-colors
              "
            >
              {t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation('common')(ErrorBoundaryClass);
