'use client';

import { useEffect } from 'react';

/**
 * Error boundary GLOBALE: cattura anche gli errori che avvengono nel root layout
 * (dove `app/error.tsx` non arriva). Deve renderizzare i propri <html>/<body>.
 * Logga l'errore reale e offre il ricaricamento.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Appoint] Errore globale:', error);
  }, [error]);

  return (
    <html lang='it'>
      <body
        style={{
          backgroundColor: '#224677',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Si è verificato un errore
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 16 }}>
            Ricarica la pagina; se il problema persiste, segnala all&apos;IT il
            messaggio qui sotto.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                background: 'white',
                color: '#224677',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Riprova
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                background: 'transparent',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.4)',
                cursor: 'pointer',
              }}
            >
              Ricarica la pagina
            </button>
          </div>
          <pre
            style={{
              textAlign: 'left',
              fontSize: 12,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              padding: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {error?.message || 'Errore sconosciuto'}
            {error?.digest ? `\n\n(rif. ${error.digest})` : ''}
          </pre>
        </div>
      </body>
    </html>
  );
}
