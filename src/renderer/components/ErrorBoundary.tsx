import React from 'react';
import { AlertOctagon } from 'lucide-react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundaryClass extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reload = () => {
    window.location.reload();
  };

  render() {
    const { t } = this.props;
    if (this.state.error) {
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
              {this.state.error.message}
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
