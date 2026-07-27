import { esitoToStatus } from './utils';

/**
 * Stati "canonici" di un punto vendita.
 *
 * Sono l'unico vocabolario condiviso fra Dashboard e Mappa: le card della
 * Dashboard raggruppano per questi valori e il pin sceglie il colore in base
 * agli stessi. `stores.status` usa già questi valori; gli esiti dei workflow
 * `manage_form` (es. AiCall) ci vengono ricondotti da `esitoToStatus`.
 */
export const CANONICAL_STATUSES = [
  'free',
  'in_progress',
  'concluded',
  'already_client',
  'failed',
  'not_interested',
  'non_existent',
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

/**
 * Status EFFETTIVO di un punto vendita — la funzione da cui devono passare
 * **sia** la Dashboard **sia** la mappa per decidere "in che gruppo sta".
 *
 * Perché serve: per i clienti con `manage_form` + `lock_pin` (oggi AiCall) lo
 * `stores.status` grezzo è SEMPRE `in_progress` dal primo esito in poi — il pin
 * viene solo "preso in carico". L'informazione vera sta nell'esito salvato in
 * `store_visit_outcomes.outcome_data.esito`. Senza questa funzione la mappa
 * mostrerebbe per sempre il pin giallo mentre la Dashboard classifica lo stesso
 * negozio come "Non interessato", "Contratto sottoscritto", ecc.
 *
 * Regola: l'esito, quando c'è, VINCE sullo status grezzo. Se manca si ricade
 * sullo status del negozio (clienti "classici" senza esiti). La mappatura
 * esito → status vive in un unico posto, `utils/utils.ts → ESITO_TO_STATUS`.
 *
 * @param rawStatus  `stores.status` (o il valore locale più aggiornato)
 * @param esito      valore di `outcome_data.esito`, se il negozio ne ha uno
 */
export function effectiveStoreStatus(
  rawStatus?: string | null,
  esito?: string | null
): string {
  return esitoToStatus(esito, rawStatus);
}

/**
 * Palette delle CARD/BADGE della Dashboard, per status canonico.
 *
 * Nota: la mappa usa una propria palette (le icone SVG dei pin in
 * `utils/nav-icons.ts`), che per tre stati NON coincide con questa —
 * `already_client` (pin verde vs card blu), `not_interested` (pin rosso vs card
 * grigia), `non_existent` (pin grigio vs card arancione). La divergenza è
 * preesistente e viene lasciata invariata di proposito: allinearle cambierebbe
 * il colore di pin già in produzione. Ciò che questo modulo garantisce è che
 * entrambe le superfici partano dallo STESSO status canonico
 * (`effectiveStoreStatus`), non che usino gli stessi colori.
 */
export const STATUS_CARD_UI: Record<string, { color: string; bgColor: string }> = {
  in_progress: { color: 'text-amber-500', bgColor: 'bg-amber-500/20' },
  concluded: { color: 'text-green-500', bgColor: 'bg-green-500/20' },
  already_client: { color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  failed: { color: 'text-red-500', bgColor: 'bg-red-500/20' },
  not_interested: { color: 'text-gray-500', bgColor: 'bg-gray-500/20' },
  non_existent: { color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
};
