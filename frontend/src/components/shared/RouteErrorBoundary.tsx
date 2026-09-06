import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  /** Bump this (e.g. with the current pathname) to auto-reset the boundary on navigation. */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Page-level error boundary. Mounted *inside* each role shell (wrapping the
 * router <Outlet/>), so a crashing page renders this fallback in the content
 * area while the sidebar / topbar stay alive — instead of a thrown render
 * error unmounting the whole app to a blank screen.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Clear the error when the user navigates to a different page.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
            <AlertTriangle className="h-6 w-6 text-danger" />
          </div>
          <h2 className="text-lg font-semibold text-ink">This page hit a snag</h2>
          <p className="mt-2 text-sm text-ink-secondary">
            Something went wrong while loading this view. The rest of the app is still working —
            you can retry, or use the menu to go elsewhere.
          </p>
          <button
            onClick={this.handleRetry}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
