import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ChunkErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface ChunkErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unable to load the 3D viewer module.',
    };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Handled cleanly in render fallback UI
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          data-testid="chunk-load-error"
          className="rounded-xl border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 p-6 sm:p-8 space-y-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="h-6 w-6 shrink-0 text-rose-700 dark:text-rose-300 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">
                3D Model Viewer Failed to Load
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                The lazy-loaded 3D chunk could not be fetched (this can happen if the app was redeployed while your browser held a stale cache). Reload the page to fetch the latest bundle.
              </p>
              {this.state.message && (
                <p className="font-mono text-xs text-rose-800 dark:text-rose-300 break-all pt-1">
                  {this.state.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Reload Page</span>
            </button>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <span>Retry Chunk Load</span>
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
