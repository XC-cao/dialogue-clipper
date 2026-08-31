import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Dialogue Clipper side panel failed to render', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main className="panel-fallback">
      <div>!</div>
      <strong>The sidebar could not be displayed</strong>
      <p>Your local clips are still safe. Reload the extension first. If the problem continues, check the extension details for errors.</p>
      <button className="primary" onClick={() => location.reload()}>Reload sidebar</button>
    </main>;
  }
}
