'use client';

import { useEffect } from 'react';

/**
 * Error boundary di route (App Router). Cattura le eccezioni lato client che
 * altrimenti mostrerebbero la schermata bianca/blu "Application error: a
 * client-side exception has occurred" di Next.js in produzione.
 *
 * - Logga l'errore reale in console (`console.error`) → visibile in DevTools e
 *   nei Runtime Logs di Vercel, così si capisce QUALE errore e su quale azione.
 * - Mostra un messaggio comprensibile + un pulsante per riprovare/ricaricare,
 *   senza far crollare tutta l'app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log completo per diagnosi (console del browser + Vercel Runtime Logs).
    console.error('[Appoint] Errore applicativo:', error);
  }, [error]);

  return (
    <div
      style={{ backgroundColor: '#224677' }}
      className='min-h-screen w-full flex items-center justify-center p-6 text-white'
    >
      <div className='max-w-md w-full text-center'>
        <h1 className='text-xl font-semibold mb-2'>Si è verificato un errore</h1>
        <p className='text-white/80 text-sm mb-4'>
          Qualcosa è andato storto durante il caricamento. Riprova; se il
          problema persiste, segnala all&apos;IT il messaggio qui sotto.
        </p>
        <div className='flex items-center justify-center gap-2 mb-4'>
          <button
            onClick={() => reset()}
            className='px-4 py-2 rounded-md bg-white text-[#224677] font-medium hover:bg-white/90'
          >
            Riprova
          </button>
          <button
            onClick={() => window.location.reload()}
            className='px-4 py-2 rounded-md border border-white/40 text-white hover:bg-white/10'
          >
            Ricarica la pagina
          </button>
        </div>
        <pre className='text-left text-xs bg-black/20 border border-white/20 rounded-md p-3 whitespace-pre-wrap break-words text-white/80'>
          {error?.message || 'Errore sconosciuto'}
          {error?.digest ? `\n\n(rif. ${error.digest})` : ''}
        </pre>
      </div>
    </div>
  );
}
