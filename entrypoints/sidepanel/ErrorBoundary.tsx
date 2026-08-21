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
      <strong>侧栏暂时无法显示</strong>
      <p>你的本地摘录仍然保留。请先重新加载扩展；若问题持续，可在扩展详情中查看错误。</p>
      <button className="primary" onClick={() => location.reload()}>重新加载侧栏</button>
    </main>;
  }
}
