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
