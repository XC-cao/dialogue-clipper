import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './card-navigation.css';
import './mind-map.css';
import './conversation-map.css';
import './error-boundary.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
