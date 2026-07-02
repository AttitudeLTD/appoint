import { LatLngExpression } from 'leaflet';

export interface Store {
  id: number;
  name: string;
  address: string;
  location: string; // PostGIS 'location' (geography) field
  phone: string;
  category: string;
  email: string;
  owner_name: string;
  /** Partita IVA */
  pi?: string | null;
  cf_azienda?: string | null;
  codice_ateco?: string | null;
  dipendenti?: number | string | null;
  cap?: string | null;
  comune?: string | null;
  provincia?: string | null;
  regione?: string | null;
  coordinates?: [number, number] | null;
  /** Data di setup del lead fornita dal partner (es. AiCall). Distinta da `created_at`. ISO date (yyyy-mm-dd). */
  data_setup?: string | null;
  status:
    | 'free'
    | 'in_progress'
    | 'concluded'
    | 'already_client'
    | 'failed'
    | 'not_interested'
    | 'non_existent';
  tier: 'bronze' | 'silver' | 'gold' | 'gold+';
  fatturato?: number | string; // Annual revenue, optional as it might not be available for all stores
  client_id?: number | null;
  client_name?: string | null;
  client_logo?: string | null; // storage path in bucket client-logos
  /**
   * Tutti i client a cui lo store è associato via `store_clients` (N:N).
   * Include sempre `client_id` (cliente primario). Popolato lato applicativo
   * dove serve (es. popup del pin); non sempre presente nei payload di mappa.
   */
  client_ids?: number[];
  /** UUID dell'utente che ha caricato il punto vendita via app. NULL per le righe importate in bulk. */
  created_by?: string | null;
  modifiedByOtherUser: boolean;
  modifierName?: string; // Optional name of the agent who modified the store
  modifierId?: string; // UUID of the agent who modified (for AM/supervisor visibility)
}

export interface Agent {
  name: string;
  surname: string;
  number: string;
}

export interface StoreLog {
  id: number;
  prev: string;
  new: string;
  created_at: string;
  modifier: number;
  modifierName?: string; // Name of the user who made the change
}

// ── Workflow types ─────────────────────────────────────────────────────────────

export interface WorkflowOption {
  value: string;
  label: string;
  requiresPhoto?: boolean;
  photoLabel?: string;
  freeText?: boolean;
  freeTextLabel?: string;
  externalLink?: boolean;
}

export interface WorkflowMainChoice {
  value: string;
  label: string;
  subOptions: WorkflowOption[];
}

export interface WorkflowSection {
  id: string;
  title: string;
  type: 'choice_with_sub' | 'multi_terminal' | 'choice' | 'multi_select';
  mainChoices?: WorkflowMainChoice[]; // choice_with_sub
  terminals?: WorkflowOption[];       // multi_terminal
  terminalNoteLabel?: string;         // multi_terminal: label per campo note per ogni terminale
  choices?: WorkflowOption[];         // choice
  options?: WorkflowOption[];         // multi_select
}

export interface WorkflowReason {
  value: string;
  label: string;
  freeText?: boolean;
  freeTextLabel?: string;
}

export interface ClientWorkflow {
  dom_link?: string;
  failed_reasons?: WorkflowReason[];
  non_existent_reasons?: WorkflowReason[];
  concluded_sub_workflow?: {
    sections: WorkflowSection[];
  };
  already_client_sub_workflow?: {
    sections: WorkflowSection[];
  };

  /**
   * Form della schermata "Gestisci" definito interamente da JSON.
   *
   * Quando questo campo è valorizzato per un cliente, lo Sheet "Gestisci" del
   * pin viene renderizzato dal componente <DynamicManageForm /> usando questa
   * configurazione e NON viene mostrata la UI legacy hardcoded.
   *
   * Quando assente (clienti "legacy", es. 1 e 2) il comportamento attuale
   * resta identico al 100%.
   */
  manage_form?: DynamicManageForm;
}

// ── Dynamic form (manage_form) ────────────────────────────────────────────────

export type DynamicFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'radio'
  | 'photo'
  | 'external_link'
  | 'info'
  /**
   * Select degli status dello store: al cambio chiama immediatamente
   * `handleStatusChangeAttempt` (stesso flow del legacy, con dialog di
   * conferma) e di conseguenza l'icona del pin sulla mappa si aggiorna.
   * Le opzioni di default sono quelle di `statuses` in `utils/utils.ts`;
   * con `options` si può limitare a un sottoinsieme (es. solo `free`,
   * `in_progress`, `failed` per il cliente "Lead da Maintenance").
   */
  | 'status_select';

export interface DynamicFieldOption {
  value: string;
  label: string;
}

/**
 * Condizione di visibilità di un field. Se assente, il field è sempre visibile.
 * Esempio: `{ field: 'outcome', equals: 'interested' }` mostra il field solo
 * quando il field con id "outcome" ha valore "interested".
 */
export interface DynamicFieldCondition {
  field: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: Array<string | number>;
}

export interface DynamicField {
  id: string;
  type: DynamicFieldType;
  label?: string;
  placeholder?: string;
  required?: boolean;
  help?: string;

  // select / multi_select / radio
  options?: DynamicFieldOption[];

  // number
  min?: number;
  max?: number;
  step?: number;

  // photo
  bucket?: string;        // default: "generic-photos"
  capture?: 'environment' | 'user'; // default: "environment"

  // external_link
  url?: string;
  buttonLabel?: string;

  // info
  text?: string;
  variant?: 'info' | 'warning' | 'success';

  // Visibility (mostra il field solo se la condizione è soddisfatta)
  show_if?: DynamicFieldCondition;
}

export interface DynamicSection {
  id: string;
  title?: string;
  description?: string;
  fields: DynamicField[];
  show_if?: DynamicFieldCondition;
}

export type DynamicActionType =
  | 'directions'      // apre Google/Apple Maps
  | 'phone'           // tel:store.phone
  | 'email'           // mailto:store.email (uso template di default)
  | 'external_link'   // URL custom
  | 'status_change';  // cambia lo stato del store

export interface DynamicAction {
  id: string;
  type: DynamicActionType;
  label: string;
  icon?: 'navigation' | 'phone' | 'mail' | 'external' | 'check' | 'x' | 'ban' | 'star' | 'plus' | 'settings';
  url?: string;       // solo per external_link
  status?:            // solo per status_change
    | 'in_progress'
    | 'concluded'
    | 'already_client'
    | 'failed'
    | 'not_interested'
    | 'non_existent';
  show_if?: DynamicFieldCondition;
}

export interface DynamicManageForm {
  version: 1;
  /** Pulsanti in cima allo Sheet (es. Indicazioni / Chiama / Apri link). */
  primary_actions?: DynamicAction[];
  /** Sezioni con i field configurabili. */
  sections: DynamicSection[];
  /** Bottone di salvataggio finale. */
  submit?: {
    label?: string;                                 // default: "Salva"
    /** Se impostato, al submit cambia anche lo stato del store. */
    sets_status?:
      | 'in_progress'
      | 'concluded'
      | 'already_client'
      | 'failed'
      | 'not_interested'
      | 'non_existent';
    /** Se true (default), persiste i valori in store_visit_outcomes.outcome_data. */
    save_to_outcomes?: boolean;
  };
}

// ──────────────────────────────────────────────────────────────────────────────

export type StorePopupProps = {
  store: Store;
  coord: [number, number];
  statusLogs: { [key: number]: StoreLog[] };
  loadingStatus: { [key: number]: boolean };
  loadingEmail: boolean;
  storeStatuses: { [key: number]: string };
  fetchStatusLogs: (storeId: number, offset?: number) => Promise<number | void>;
  handleStatusChangeAttempt: (
    storeId: number,
    newStatus: string,
    note?: string,
    checkInProgressLimit?: boolean
  ) => Promise<boolean>;
  handleSendEmail: (store: Store) => void;
};
