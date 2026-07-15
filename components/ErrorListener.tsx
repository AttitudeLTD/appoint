'use client';

import { useEffect } from 'react';
import { logClientError } from '@/utils/error-logger';

/**
 * Listener globale: intercetta le eccezioni non catturate dai React error
 * boundary (errori sincroni "window.onerror" e promise rejection non gestite) e
 * le registra su `public.error_logs`. Montato una volta nel root layout.
 */
export function ErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      void logClientError(e.error ?? e.message, 'window_onerror');
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      void logClientError(e.reason, 'unhandledrejection');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
