import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';

// --- Analytics: PostHog
const PH_KEY = (import.meta as any).env?.VITE_POSTHOG_KEY;
const PH_HOST = (import.meta as any).env?.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
if (PH_KEY) {
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    capture_pageview: true,
    persistence: 'localStorage',
  });
}

// --- Error tracking: Sentry
const SENTRY_DSN = (import.meta as any).env?.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
