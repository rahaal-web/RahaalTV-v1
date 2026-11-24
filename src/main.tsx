import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {installGlobalErrorLogging} from './lib/clientLogger.ts';
import './index.css';

installGlobalErrorLogging();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const payload = event.data as { type?: unknown; url?: unknown } | undefined;
    if (payload?.type === 'RTV_PUSH_NAVIGATE' && typeof payload.url === 'string') {
      window.dispatchEvent(
        new CustomEvent('rtv:push-navigate', { detail: { url: payload.url } })
      );
    }
  });
}

if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      const staleRegs = registrations.filter((reg) => {
        const scriptUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        return !scriptUrl.endsWith('/push-sw.js');
      });
      if (staleRegs.length === 0) return;
      await Promise.all(staleRegs.map((reg) => reg.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      const reloadKey = 'rahaltv_sw_dev_cleaned';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
    });
  }
} else {
  let reloading = false;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
