'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader, MapPin, Search } from 'lucide-react';

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
  alreadyClientPin,
  alreadyClientPinM,
  closedPin,
  closedPinM,
  failedPin,
  failedPinM,
  freePin,
  freePinM,
  navIcon,
  notInterestedPin,
  notInterestedPinM,
  progressPin,
  progressPinM,
  nonExistentPin,
  nonExistentPinM,
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
  const [limitDialogOpen, setLimitDialogOpen] = useState(false); // For in-progress limit dialog
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<[number, number]>();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showSearchResults, setShowSearchResults] = useState(true);
  const [showGeoMessage, setShowGeoMessage] = useState(false);

  function MapClickHandler() {
    const map = useMap();

    useEffect(() => {
      const handleMapClick = () => {
        setShowSearchResults(false);
      };

      map.on('click', handleMapClick);

      return () => {
        map.off('click', handleMapClick);
      };
    }, [map]);

    return null;
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          handleSelectLocation(searchResults[focusedIndex]);
        }
        break;
    }
  };

  const handleStatusChangeAttempt = async (
    storeId: number,
    newStatus: string,
    note?: string,
    checkInProgressLimit?: boolean
  ): Promise<boolean> => {
    // Handle in-progress limit check if needed
    if (checkInProgressLimit && newStatus === 'in_progress') {
      try {
        // First get all stores that have a log where this user set them to in_progress
        const { data: potentialInProgressStores, error: storesError } =
          await supabase
            .from('store_status_logs')
            .select('store_id')
            .eq('modifier', user.id)
            .eq('new', 'in_progress');

        if (storesError) throw storesError;

        if (
          !potentialInProgressStores ||
          potentialInProgressStores.length === 0
        ) {
          // No in-progress stores found, proceed
        } else {
          // Get unique store IDs
          const uniqueStoreIds = Array.from(
            new Set(potentialInProgressStores.map((store) => store.store_id))
          );

          // For each of these stores, check if the latest status log is 'in_progress'
          let currentInProgressCount = 0;

          // Run these checks in parallel
          const checkPromises = uniqueStoreIds.map(async (storeId) => {
            const { data: latestLog, error: logError } = await supabase
              .from('store_status_logs')
              .select('*')
              .eq('store_id', storeId)
              .order('created_at', { ascending: false })
              .limit(1);

            if (logError) throw logError;

            // If the latest log for this store shows 'in_progress' and was set by this user, count it
            if (
              latestLog &&
              latestLog.length > 0 &&
              latestLog[0].new === 'in_progress' &&
              latestLog[0].modifier === user.id
            ) {
              return true; // This counts as an in-progress store
            }

            return false;
          });

          // Wait for all checks to complete
          const results = await Promise.all(checkPromises);
          currentInProgressCount = results.filter(Boolean).length;

          if (currentInProgressCount >= 10) {
            // Show a dialog instead of alert
            setLimitDialogOpen(true);
            return false;
          }
        }
      } catch (error) {
        console.error('Error checking in-progress store count:', error);
        setLimitDialogOpen(true);
        return false;
      }
    }

    setSelectedStoreId(storeId);
    setSelectedStatus(newStatus || '');
    setSelectedNote(note || '');
    setDialogOpen(true);
    return true;
  };

  const confirmStatusChange = async () => {
    setLoadingConfirm(true);

    if (selectedStoreId && selectedStatus) {
      await updateStoreStatus(selectedStoreId, selectedStatus, selectedNote);

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
    setSelectedNote(''); // Reset the selected note
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

  const updateStoreStatus = async (
    storeId: number,
    newStatus: string,
    note?: string
  ) => {
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
            notes: newStatus === 'failed' && note ? note : null,
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

  const fetchStatusLogs = async (storeId: number, offset: number = 0) => {
    try {
      const { data, error } = await supabase
        .from('store_status_logs')
        .select('id, prev, new, created_at, modifier')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .range(offset, offset + 2); // This gets 3 logs (0,1,2 or 3,4,5 etc.)

      if (error) {
        console.error('Error fetching status logs:', error);
        return;
      }

      // For each log, fetch the user's name and surname
      if (data && data.length > 0) {
        const logsWithUserInfo = await Promise.all(
          data.map(async (log) => {
            const userInfo = await fetchUserInfo(log.modifier);
            return {
              ...log,
              modifierName: userInfo
                ? `${userInfo.name} ${userInfo.surname}`
                : 'Unknown User',
            };
          })
        );

        // If offset is 0, replace logs; otherwise append them
        setStatusLogs((prev) => ({
          ...prev,
          [storeId]:
            offset === 0
              ? logsWithUserInfo
              : [...(prev[storeId] || []), ...logsWithUserInfo],
        }));

        // Return the count of logs retrieved for UI feedback
        return logsWithUserInfo.length;
      } else {
        if (offset === 0) {
          // Only clear if this is the initial fetch
          setStatusLogs((prev) => ({
            ...prev,
            [storeId]: [],
          }));
        }
        return 0;
      }
    } catch (error) {
      console.error('Error in fetchStatusLogs:', error);
    }
  };

  // New function to fetch user information by ID
  const fetchUserInfo = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('name, surname')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user info:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error in fetchUserInfo:', error);
      return null;
    }
  };

  const fetchStoresAndLogs = useCallback(
    async (lat: number, lng: number) => {
      const { data: storesData } = await supabase.rpc(
        'get_stores_within_radius',
        { lat, lng, radius: 800 }
      );

      const storesWithLogs = await Promise.all(
        storesData.map(async (store: any) => {
          const { data: logs } = await supabase
            .from('store_status_logs')
            .select('modifier, created_at')
            .eq('store_id', store.id)
            .order('created_at', { ascending: false });

          const modifiedByOtherUser =
            store.status !== 'free' &&
            logs?.some((log) => log.modifier !== user.id);

          // If modified by another user, get their information
          let modifierName = '';
          if (modifiedByOtherUser && logs && logs.length > 0) {
            // Find the latest log from another user
            const otherUserLog = logs.find((log) => log.modifier !== user.id);
            if (otherUserLog) {
              const userInfo = await fetchUserInfo(otherUserLog.modifier);
              if (userInfo) {
                modifierName = `${userInfo.name} ${userInfo.surname}`;
              }
            }
          }

          return { ...store, modifiedByOtherUser, modifierName };
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

    // Set timeout for geolocation message
    const geoTimeout = setTimeout(() => {
      if (!coord) {
        setShowGeoMessage(true);
      }
    }, 3000);

    getMyLoc((coords: LatLngExpression | null) => {
      if (coords && Array.isArray(coords)) {
        setCoord(coords);
        fetchStoresAndLogs(coords[0], coords[1]);
      }
    });

    getUserName();

    return () => clearTimeout(geoTimeout);
  }, [user.id, supabase, fetchStoresAndLogs]);

  // Listener per il refresh quando viene creato un nuovo store
  useEffect(() => {
    const handleStoreCreated = (event: CustomEvent) => {
      if (coord && Array.isArray(coord)) {
        // Refresh immediato dei punti vendita nella zona corrente
        fetchStoresAndLogs(coord[0], coord[1]);
      }
    };

    window.addEventListener(
      'storeCreated',
      handleStoreCreated as EventListener
    );

    return () => {
      window.removeEventListener(
        'storeCreated',
        handleStoreCreated as EventListener
      );
    };
  }, [coord, fetchStoresAndLogs]);

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

  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchResults]);

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
              {selectedStatus === 'failed' && selectedNote && (
                <>
                  {' '}
                  con motivo <strong>{selectedNote}</strong>
                </>
              )}
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

      <AlertDialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <AlertDialogContent className='z-1000'>
          <AlertDialogHeader>
            <AlertDialogTitle>Limite di trattative raggiunto</AlertDialogTitle>
            <AlertDialogDescription>
              Hai già 10 trattative in corso. Concludi o chiudi almeno una
              trattativa prima di iniziarne un&apos;altra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLimitDialogOpen(false)}>
              Ho capito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className='relative w-full h-full'>
        {coord && (
          <div className='absolute top-4 left-4 z-[1000] w-[400px]'>
            <div className='relative'>
              <Input
                type='text'
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder='Cerca indirizzo...'
                className='w-full px-4 py-2 pl-10 border rounded-full shadow-md'
              />
              <Search className='absolute left-3 top-2.5 h-5 w-5 text-gray-400' />

              {searchResults.length > 0 && showSearchResults && (
                <div className='absolute w-full mt-2 shadow-lg max-h-60 overflow-auto'>
                  {searchResults.map((result, index) => (
                    <Button
                      key={index}
                      variant={'outline'}
                      className={`w-full px-4 py-1 text-left flex justify-start border-none focus:outline-none ${
                        index === 0
                          ? 'rounded-md rounded-b-none'
                          : index === searchResults.length - 1
                            ? 'rounded-md rounded-t-none'
                            : 'rounded-none'
                      } ${focusedIndex === index ? 'bg-accent text-accent-foreground' : ''}`}
                      onClick={() => handleSelectLocation(result)}
                    >
                      <MapPin className='h-4 w-4 text-gray-400 flex-shrink-0' />
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
            <MapClickHandler />
            <MapController newCenter={selectedLocation} />
            <MapEventHandler onMapMove={fetchStoresAndLogs} />
            <TileLayer url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' />
            <ZoomControl position='bottomright' />

            {/* Marker for the user's current location */}
            <Marker icon={navIcon} position={coord}>
              <Popup>
                Ciao {agent?.name}, utilizza la mappa per trovare le opportunità
                di vendita più vicine a te.
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
                      : store.status === 'already_client'
                        ? alreadyClientPinM
                        : store.status === 'not_interested'
                          ? notInterestedPinM
                          : store.status === 'non_existent'
                            ? nonExistentPinM
                            : failedPinM
                : store.status === 'free'
                  ? freePin
                  : store.status === 'in_progress'
                    ? progressPin
                    : store.status === 'concluded'
                      ? closedPin
                      : store.status === 'already_client'
                        ? alreadyClientPin
                        : store.status === 'not_interested'
                          ? notInterestedPin
                          : store.status === 'non_existent'
                            ? nonExistentPin
                            : failedPin;

              return store.modifiedByOtherUser ? (
                <Marker key={store.id} position={storeCoordinates} icon={icon}>
                  <Popup>
                    In questo punto vendita è in corso una trattativa gestita da
                    {store.modifierName
                      ? ` ${store.modifierName}`
                      : ' un altro agente'}
                    .
                  </Popup>
                </Marker>
              ) : (
                <Marker key={store.id} position={storeCoordinates} icon={icon}>
                  <Popup>
                    <StorePopup
                      store={store}
                      coord={storeCoordinates}
                      statusLogs={{ [store.id]: statusLogs[store.id] || [] }}
                      loadingStatus={{ [store.id]: !!loadingStatus[store.id] }}
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
            {showGeoMessage && (
              <p className='text-sm mt-4 text-muted-foreground max-w-md text-center'>
                Se la mappa non si carica, verifica di aver dato i permessi di
                geolocalizzazione al browser e poi aggiorna la pagina.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default Map;
