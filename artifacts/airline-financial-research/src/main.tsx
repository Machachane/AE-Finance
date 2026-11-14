import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import './theme-dark.css';

// Static deployments call the published backend. Other builds retain the
// artifact's path prefix for generated API requests.
setBaseUrl(import.meta.env.VITE_API_BASE_URL?.trim()
  || import.meta.env.BASE_URL.replace(/\/$/, '') || null);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
