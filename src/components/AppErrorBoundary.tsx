import { RefreshCw, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FIND YOUR LOVE render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCacheAndReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Ignore cache clear failures
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#FAF7FC] text-[#1E102E] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-purple-950/15 p-6 shadow-sm text-center space-y-4">
          <h1 className="text-xl font-bold text-[#2E1065]">
            Unable to display this screen
          </h1>
          <p className="text-sm text-purple-950/75 leading-relaxed">
            A temporary browser or network error interrupted loading FIND YOUR LOVE. Your account and messages are safe.
          </p>
          {this.state.errorMessage && (
            <p className="text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 break-words">
              {this.state.errorMessage}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2E1065] hover:bg-[#4C1D95] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Page</span>
            </button>
            <button
              type="button"
              onClick={() => void this.handleResetCacheAndReload()}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-[#2E1065] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Clear Cache & Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
