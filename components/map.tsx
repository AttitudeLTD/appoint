'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader, Search } from 'lucide-react';

import { LatLngExpression } from 'leaflet';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { Agent, Store, StoreLog } from '@/types';
import { createClient } from '@/utils/supabase/client';
import { getMyLoc, parseCoords } from '@/utils/navigation';
import { generateMailBody, statuses } from '@/utils/utils';
import {
  closedPin,
  closedPinM,
  failedPin,
  failedPinM,
  freePin,
  freePinM,
  navIcon,
  progressPin,
  progressPinM,
} from '@/utils/nav-icons';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Input } from './ui/input';

import StorePopup from './StorePopup';
import { Button } from './ui/button';

// Create a new component to handle map movements
function MapEventHandler({
  onMapMove,
}: {
  onMapMove: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const handleMoveEnd = () => {
      const center = map.getCenter();
      onMapMove(center.lat, center.lng);
    };

    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, onMapMove]);

  return null;
}

// Add this type for search results
type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

// Add this new component to handle map movement
function MapController({ newCenter }: { newCenter?: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    if (newCenter) {
      map.setView(newCenter, 16);
    }
  }, [map, newCenter]);

  return null;
}

const Map = ({ user }: any) => {
  const supabase = createClient();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [coord, setCoord] = useState<LatLngExpression | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingEmail, setLoadingEmail] = useState<boolean>(false); // For email sending
  const [loadingStatus, setLoadingStatus] = useState<{
    [key: number]: boolean;
  }>({}); // For status update
  const [storeStatuses, setStoreStatuses] = useState<{ [key: number]: string }>(
    {}
  ); // Store statuses
  const [statusLogs, setStatusLogs] = useState<{ [key: number]: StoreLog[] }>(
    {}
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<[number, number]>();

  const handleStatusChangeAttempt = (storeId: number, newStatus: string) => {
    setSelectedStoreId(storeId);
    setSelectedStatus(newStatus || '');
    setDialogOpen(true);
  };

  const confirmStatusChange = async () => {
    setLoadingConfirm(true);

    if (selectedStoreId && selectedStatus) {
      await updateStoreStatus(selectedStoreId, selectedStatus);

      setStores(
        (prevStores) =>
          prevStores.map((store) =>
            store.id === selectedStoreId
              ? { ...store, status: selectedStatus }
              : store
          ) as Store[]
      );

      // Refetch logs for the specific store after status update
      await fetchStatusLogs(selectedStoreId);
    }

    setLoadingConfirm(false);
    setDialogOpen(false);
  };

  const fetchStoreStatus = async (storeId: number) => {
    setLoadingStatus((prev) => ({ ...prev, [storeId]: true }));
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('status')
        .eq('id', storeId)
        .single();

      if (error) {
        console.error('Error fetching store status:', error);
      } else {
        setStoreStatuses((prev) => ({ ...prev, [storeId]: data?.status }));
      }
    } catch (error) {
      console.error('Unexpected error while fetching status:', error);
    } finally {
      setLoadingStatus((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const updateStoreStatus = async (storeId: number, newStatus: string) => {
    setLoadingStatus((prev) => ({ ...prev, [storeId]: true }));
    try {
      const { error: updateError } = await supabase
        .from('stores')
        .update({ status: newStatus })
        .eq('id', storeId);

      if (!updateError) {
        // Immediately update storeStatuses state
        setStoreStatuses((prevStatuses) => ({
          ...prevStatuses,
          [storeId]: newStatus,
        }));

        // Insert a new log for the status change
        await supabase.from('store_status_logs').insert([
          {
            store_id: storeId,
            prev: storeStatuses[storeId] || 'free',
            new: newStatus,
            modifier: user.id,
          },
        ]);

        await fetchStatusLogs(storeId); // Refetch logs
      } else {
        console.error('Error updating store status:', updateError);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setLoadingStatus((prev) => ({ ...prev, [storeId]: false }));
    }
  };

  const fetchStatusLogs = async (storeId: number) => {
    try {
      const { data, error } = await supabase
        .from('store_status_logs')
        .select('id, prev, new, created_at, modifier')
        .eq('store_id', storeId)
        .eq('modifier', user.id) // Filter by user ID
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Error fetching status logs:', error);
      } else {
        // Explicitly cast data to StoreLog[] to match the state type
        setStatusLogs((prevLogs) => ({
          ...prevLogs,
          [storeId]: (data as StoreLog[]) || [],
        }));
      }
    } catch (error) {
      console.error('Unexpected error fetching logs:', error);
    }
  };

  const fetchStoresAndLogs = useCallback(
    async (lat: number, lng: number) => {
      const { data: storesData } = await supabase.rpc(
        'get_stores_within_radius',
        { lat, lng, radius: 3000 }
      );

      const storesWithLogs = await Promise.all(
        storesData.map(async (store: any) => {
          const { data: logs } = await supabase
            .from('store_status_logs')
            .select('modifier')
            .eq('store_id', store.id);
          const modifiedByOtherUser = logs?.some(
            (log) => log.modifier !== user.id
          );
          return { ...store, modifiedByOtherUser };
        })
      );

      setStores(storesWithLogs);
    },
    [supabase, user.id]
  );

  useEffect(() => {
    // Fetch user's name
    const getUserName = async () => {
      const { data: userName, error } = await supabase
        .from('users')
        .select('name, surname, number')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user name:', error);
      } else {
        setAgent(userName || null);
      }
    };

    getMyLoc((coords: LatLngExpression | null) => {
      if (coords && Array.isArray(coords)) {
        setCoord(coords);
        fetchStoresAndLogs(coords[0], coords[1]);
      }
    });

    getUserName();
  }, [user.id, supabase, fetchStoresAndLogs]);

  useEffect(() => {
    // Fetch status for all stores once they are loaded
    stores.forEach((store) => {
      if (!storeStatuses[store.id]) {
        fetchStoreStatus(store.id);
      }
    });
  }, [stores, storeStatuses]);

  const handleSendEmail = (store: Store) => {
    setLoadingEmail(true); // Start loading for email

    const mailBody = generateMailBody(store, agent);

    const mailto = `mailto:${store.email}?subject=Proposta commerciale&body=${encodeURIComponent(mailBody)}`;
    window.location.href = mailto; // Open the default email client with the personalized email

    setTimeout(() => {
      setLoadingEmail(false); // Reset loading state after a short delay
    }, 3000); // This simulates the time taken to send the email
  };

  // Add debounced search function
  const searchAddress = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=5`
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching address:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Add debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchAddress(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (result: SearchResult) => {
    const newLocation: [number, number] = [
      parseFloat(result.lat),
      parseFloat(result.lon),
    ];
    setSelectedLocation(newLocation);
    setSearchResults([]);
    setSearchQuery('');
  };

  return (
    <>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className='z-1000'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Sei sicuro di voler cambiare lo stato?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questo punto vendita verrà contrassegnato come{' '}
              <strong>
                {statuses.find((status) => status.value === selectedStatus)
                  ?.label || selectedStatus}
              </strong>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDialogOpen(false)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={loadingConfirm}
            >
              {loadingConfirm ? (
                <Loader className='animate-spin' />
              ) : (
                'Conferma'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className='relative w-full h-full'>
        {coord && (
          <div className='absolute top-4 left-4 z-[1000] w-[300px]'>
            <div className='relative'>
              <Input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Cerca indirizzo...'
                className='w-full px-4 py-2 pl-10 border rounded-full shadow-md'
              />
              <Search className='absolute left-3 top-2.5 h-5 w-5 text-gray-400' />

              {searchResults.length > 0 && (
                <div className='absolute w-full mt-2 shadow-lg max-h-60 overflow-auto'>
                  {searchResults.map((result, index) => (
                    <Button
                      key={index}
                      className={`w-full px-4 py-2 text-left focus:outline-none ${
                        index === 0
                          ? 'rounded-md rounded-b-none'
                          : index === searchResults.length - 1
                            ? 'rounded-md rounded-t-none'
                            : 'rounded-none'
                      }`}
                      onClick={() => handleSelectLocation(result)}
                    >
                      <p className='text-sm truncate'>{result.display_name}</p>
                    </Button>
                  ))}
                </div>
              )}

              {/* Loading indicator */}
              {isSearching && (
                <div className='absolute right-3 top-2.5'>
                  <Loader className='h-5 w-5 animate-spin text-gray-400' />
                </div>
              )}
            </div>
          </div>
        )}

        {coord ? (
          <MapContainer
            style={{
              height: '80vh',
              width: '100vw',
            }}
            center={coord}
            zoom={16}
            scrollWheelZoom={true}
            zoomControl={false}
          >
            <MapController newCenter={selectedLocation} />
            <MapEventHandler onMapMove={fetchStoresAndLogs} />
            <TileLayer url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' />
            <ZoomControl position='bottomright' />

            {/* Marker for the user's current location */}
            <Marker icon={navIcon} position={coord}>
              <Popup>
                Ciao {agent?.name}, oggi ti mancano 3 attività per raggiungere
                il tuo obiettivo.
              </Popup>
            </Marker>

            {/* Marker for each store within 3km */}
            {stores.map((store) => {
              const storeCoordinates = parseCoords(store.location);
              if (!storeCoordinates) return null; // Skip rendering if coordinates are invalid

              const icon = store.modifiedByOtherUser
                ? store.status === 'free'
                  ? freePinM
                  : store.status === 'in_progress'
                    ? progressPinM
                    : store.status === 'concluded'
                      ? closedPinM
                      : failedPinM
                : store.status === 'free'
                  ? freePin
                  : store.status === 'in_progress'
                    ? progressPin
                    : store.status === 'concluded'
                      ? closedPin
                      : failedPin;

              return store.modifiedByOtherUser ? (
                <Marker key={store.id} position={storeCoordinates} icon={icon}>
                  <Popup>
                    In questo punto vendita è in corso una trattativa gestita da
                    un altro agente.
                  </Popup>
                </Marker>
              ) : (
                <Marker key={store.id} position={storeCoordinates} icon={icon}>
                  <Popup>
                    <StorePopup
                      store={store}
                      coord={coord}
                      statusLogs={statusLogs[store.id] || []}
                      loadingStatus={loadingStatus[store.id]}
                      loadingEmail={loadingEmail}
                      storeStatuses={storeStatuses}
                      fetchStatusLogs={fetchStatusLogs}
                      handleStatusChangeAttempt={handleStatusChangeAttempt}
                      handleSendEmail={handleSendEmail}
                    />
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        ) : (
          <div className='h-[80vh] w-[100vw] flex flex-col items-center justify-center'>
            <Loader className='h-8 w-8 animate-spin text-[#1B304E] mb-4' />
            <p className='text-lg font-medium'>Caricamento mappa...</p>
            <p className='text-sm mt-2'>
              Attendi mentre recuperiamo la tua posizione
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default Map;
