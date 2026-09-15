import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../../lib/i18n';

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
      <strong>{t('sidebarErrorTitle')}</strong>
      <p>{t('sidebarErrorBody')}</p>
      <button className="primary" onClick={() => location.reload()}>{t('reloadSidebar')}</button>
    </main>;
  }
}
