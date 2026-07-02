import { redirect } from 'next/navigation';
import { Agent, Store } from '@/types';

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: 'error' | 'success',
  path: string,
  message: string
) {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

// Define a type for the status items
export type StatusItem = {
  label: string;
  value: string;
  iconType: string;
};

export const statuses: StatusItem[] = [
  {
    label: 'Disponibile',
    value: 'free',
    iconType: 'plus',
  },
  {
    label: 'Trattativa in corso',
    value: 'in_progress',
    iconType: 'clock',
  },
  {
    label: 'Contratto sottoscritto',
    value: 'concluded',
    iconType: 'check-circle',
  },
  {
    label: 'Già cliente',
    value: 'already_client',
    iconType: 'star',
  },
  {
    label: 'Bad prospect',
    value: 'failed',
    iconType: 'ban',
  },
  {
    label: 'Non interessato',
    value: 'not_interested',
    iconType: 'x',
  },
  {
    label: 'Inesistente',
    value: 'non_existent',
    iconType: 'x-circle',
  },
];

export const getStatusLabel = (value: string) => {
  return statuses.find((status) => status.value === value)?.label || value;
};

/**
 * Formatta la "Data Setup" (colonna `stores.data_setup`, tipo date) in formato
 * italiano `gg/mm/aaaa`. Accetta sia `yyyy-mm-dd` sia un ISO completo; evita gli
 * shift di fuso orario leggendo direttamente i primi 10 caratteri. Ritorna ''
 * per valori assenti/non validi.
 */
export const formatDataSetup = (value?: string | null): string => {
  if (!value) return '';
  const m = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
};

export const generateMailBody = (store: Store, agent: Agent | null): string => {
  return `Gentile Sig/Sig.ra ${store.owner_name},

sono ${agent?.name} ${agent?.surname}, consulente dell'agenzia Attitude, società mandataria di Scalapay spa, iscritto nell'elenco dell'Organismo per la gestione degli agenti in attività Finanziaria con il numero di iscrizione SP2423 (www.organismo-am.it/elenchi-registri/index.html).

In allegato troverà tutti i dettagli in merito alle soluzioni di pagamento e ai servizi offerti da Scalapay che le ho illustrato durante il nostro incontro.

Nel caso di suo interesse a procedere con la sottoscrizione, non esiti a rispondere a questa mail o a contattarmi al numero che troverà in firma.

Cordiali saluti,
${agent?.name} ${agent?.surname}
${agent?.number}`;
};
