import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { DataSaverProvider } from './context/DataSaverContext.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const { hostname, protocol } = window.location;
  const isPreviewOrLocalHost =
    protocol !== 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.run.app') ||
    hostname.includes('aistudio.google.com');

  if (isPreviewOrLocalHost) {
    // Clean up any stale preview/dev service workers that can stall applet loading
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      })
      .catch(() => {});
  } else {
    const startSW = () => {
      try {
        registerSW({
          immediate: true,
          onRegisterError() {
            // Ignore registration failures in restricted webviews
          },
        });
      } catch {
        // Ignore unexpected SW registration issues on older browsers
      }
    };
    if (document.readyState === 'complete') {
      startSW();
    } else {
      window.addEventListener('load', startSW, { once: true });
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <DataSaverProvider>
        <App />
      </DataSaverProvider>
    </AppErrorBoundary>
  </StrictMode>
);
