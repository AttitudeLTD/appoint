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
  status: 'free' | 'in_progress' | 'concluded' | 'failed';
  modifiedByOtherUser: boolean;
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
}

export interface StorePopupProps {
  store: Store;
  coord: LatLngExpression;
  statusLogs: StoreLog[];
  loadingStatus: boolean;
  loadingEmail: boolean;
  storeStatuses: { [key: number]: string };
  fetchStatusLogs: (storeId: number) => void;
  handleStatusChangeAttempt: (storeId: number, newStatus: string) => void;
  handleSendEmail: (store: Store) => void;
}
