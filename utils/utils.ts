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
 * Mappa gli esiti del workflow "manage_form" del cliente AiCall (client_id 5)
 * verso gli status "canonici" usati dalle card della dashboard.
 *
 * Motivo: quando un agente AiCall salva un esito, il pin viene solo BLOCCATO
 * (stores.status = 'in_progress') e l'esito reale finisce in
 * `store_visit_outcomes.outcome_data.esito`. Perciò lo `status` grezzo del negozio
 * è SEMPRE 'in_progress' e da solo non basta a popolare le card: bisogna leggere
 * l'esito e ricondurlo al bucket giusto.
 *
 * Mapping (chiave = valore dell'opzione "esito" configurata per AiCall):
 *   - ok_inviata_amex      → concluded      (Contratto sottoscritto / conversione)
 *   - ok_in_trattativa     → in_progress    (Trattativa in corso)
 *   - ok_richiamare        → in_progress    (Trattativa in corso)
 *   - ok_appuntamento_preso→ in_progress    (Trattativa in corso)
 *   - ko_gia_cliente       → already_client (Già cliente)
 *   - ko_non_interessato   → not_interested (Non interessato)
 *   - ko_lead_non_valido   → failed         (Bad prospect)
 *   - ko_blocco_dap        → failed         (Bad prospect)
 *   - ko_irreperibile      → non_existent   (Inesistente)
 */
export const ESITO_TO_STATUS: Record<string, string> = {
  ok_inviata_amex: 'concluded',
  ok_in_trattativa: 'in_progress',
  ok_richiamare: 'in_progress',
  ok_appuntamento_preso: 'in_progress',
  ko_gia_cliente: 'already_client',
  ko_non_interessato: 'not_interested',
  ko_lead_non_valido: 'failed',
  ko_blocco_dap: 'failed',
  ko_irreperibile: 'non_existent',
};

/**
 * Ritorna lo status canonico corrispondente a un esito manage_form. Se l'esito
 * non è mappato esplicitamente, prova a dedurlo dal prefisso (ok_/ko_) e, in
 * ultima istanza, ricade sullo status grezzo del negozio (`fallbackStatus`).
 */
export const esitoToStatus = (
  esito?: string | null,
  fallbackStatus?: string | null
): string => {
  if (esito && ESITO_TO_STATUS[esito]) return ESITO_TO_STATUS[esito];
  if (esito?.startsWith('ko_')) return 'failed';
  if (esito?.startsWith('ok_')) return 'in_progress';
  return fallbackStatus || 'free';
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
