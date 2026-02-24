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
  modifiedByOtherUser: boolean;
  modifierName?: string; // Optional name of the agent who modified the store
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
