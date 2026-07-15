'use client';

import { createClient } from '@/utils/supabase/client';

type ErrorSource =
  | 'error_boundary'
  | 'global_error'
  | 'window_onerror'
  | 'unhandledrejection';

/**
 * Registra un errore client-side nella tabella `public.error_logs` (best-effort:
 * non deve MAI far crashare a sua volta). Usato dai due error boundary
 * (`app/error.tsx`, `app/global-error.tsx`) e dal listener globale
 * (`components/ErrorListener.tsx`).
 */
export async function logClientError(
  error: unknown,
  source: ErrorSource,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createClient();

    let user_id: string | null = null;
    let user_email: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      user_id = data.user?.id ?? null;
      user_email = data.user?.email ?? null;
    } catch {
      // ignora: l'errore può avvenire pre-login
    }

    const err = error as { message?: string; stack?: string; digest?: string } | undefined;
    const message =
      (err?.message ?? (typeof error === 'string' ? error : String(error)) ?? '').slice(0, 2000);
    const stack = err?.stack ? String(err.stack).slice(0, 8000) : null;

    await supabase.from('error_logs').insert({
      message,
      stack,
      digest: err?.digest ?? null,
      source,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_id,
      user_email,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      extra: extra ?? null,
    });
  } catch {
    // best-effort: swallow
  }
}
