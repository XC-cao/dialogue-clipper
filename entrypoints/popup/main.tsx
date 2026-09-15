import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '../sidepanel/App';
import { ErrorBoundary } from '../sidepanel/ErrorBoundary';
import { setDocumentLocale } from '../../lib/i18n';
import '@xyflow/react/dist/style.css';
import '../sidepanel/styles.css';
import '../sidepanel/card-navigation.css';
import '../sidepanel/mind-map.css';
import '../sidepanel/conversation-map.css';
import '../sidepanel/error-boundary.css';

setDocumentLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
