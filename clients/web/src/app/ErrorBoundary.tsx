import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-bg px-6 text-center text-fg">
        <div className="max-w-md">
          <div className="mb-3 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
            Something went wrong
          </div>
          <h1 className="m-0 mb-3 text-2xl font-medium tracking-[-0.02em]">
            The console hit an unexpected error.
          </h1>
          <p className="m-0 mb-6 text-muted">
            <span className="font-mono text-fg-2">{this.state.error.message}</span>
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex h-10 items-center rounded-full border border-white/[0.14] px-5 text-sm hover:bg-white/5"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-full bg-mint px-5 text-sm font-medium text-[#0a0b0c] hover:bg-[#ebf7f2]"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
