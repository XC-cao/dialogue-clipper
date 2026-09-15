import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { setDocumentLocale } from '../../lib/i18n';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './notebook-header.css';
import './card-navigation.css';
import './mind-map.css';
import './conversation-map.css';
import './conversation-export.css';
import './error-boundary.css';

setDocumentLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
