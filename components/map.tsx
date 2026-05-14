'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Filter, Loader, LocateFixed, MapPin, Search, X } from 'lucide-react';

import L, { LatLngExpression } from 'leaflet';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';

import { Agent, Store, StoreLog } from '@/types';
import { createClient } from '@/utils/supabase/client';
import { getClientLogoUrl } from '@/utils/client-logo';
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
  createFreePinWithLogo,
  createFreePinMutedWithLogo,
  createFreePinColored,
  createFreePinColoredWithLogo,
  TIER_COLORS,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

import StorePopup from './StorePopup';
import { Button } from './ui/button';

type GovernanceLevel = 'agent' | 'am' | 'supervisor';

// Create a new component to handle map movements.
// Debounciamo `moveend` per evitare lo "spam" di fetch durante un pan rapido
// (Leaflet può emettere più moveend consecutivi). Un singolo fetch alla fine
// del movimento basta e riduce drasticamente il flickering dei marker.
function MapEventHandler({
  onMapMove,
}: {
  onMapMove: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const handleMoveEnd = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        const center = map.getCenter();
        onMapMove(center.lat, center.lng);
      }, 250);
    };

    map.on('moveend', handleMoveEnd);

    return () => {
      if (debounceId) clearTimeout(debounceId);
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

// Add this new component to handle map movement.
// Chiudiamo eventuale popup aperto PRIMA di volare alla nuova posizione:
// evita la transizione visiva ambigua quando l'utente cerca un indirizzo
// con un popup di un altro pin ancora aperto.
function MapController({ newCenter }: { newCenter?: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    if (newCenter) {
      map.closePopup();
      // Animazione coerente con il bottone "torna alla mia posizione":
      // stesso flyTo morbido (~0.8s) invece di un setView istantaneo.
      map.flyTo(newCenter, 16, { duration: 0.8 });
    }
  }, [map, newCenter]);

  return null;
}

// Tiene traccia se la posizione utente è ancora visibile nel viewport.
// Notifica il parent dopo ogni pan/zoom così il bottone "ricentrami" può
// comparire/scomparire automaticamente. Usiamo i bounds (non una soglia di
// metri fissa) così la sensibilità scala correttamente con il livello di zoom.
function UserLocationTracker({
  userCoord,
  onVisibilityChange,
}: {
  userCoord: [number, number];
  onVisibilityChange: (isAway: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const check = () => {
      const userLatLng = L.latLng(userCoord[0], userCoord[1]);
      onVisibilityChange(!map.getBounds().contains(userLatLng));
    };

    check();
    map.on('moveend', check);
    map.on('zoomend', check);

    return () => {
      map.off('moveend', check);
      map.off('zoomend', check);
    };
  }, [map, userCoord, onVisibilityChange]);

  return null;
}

const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  const fontSize = count < 10 ? 14 : count < 100 ? 12 : 11;
  return new L.DivIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:#1B304E;border:2.5px solid rgba(255,255,255,0.5);
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:${fontSize}px;font-weight:700;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    ">${count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

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
  const [governanceLevel, setGovernanceLevel] = useState<GovernanceLevel>('am'); // populated from users.role
  const [clients, setClients] = useState<{ id: number; name: string; logo?: string | null }[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showTierColors, setShowTierColors] = useState(true);
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  // Per AM: set di modifier user id per cui mostrare il nome (agenti nella mia area)
  const [modifierShowNameSet, setModifierShowNameSet] = useState<Set<string>>(new Set());

  // Chiudi popup filtri al click fuori
  useEffect(() => {
    if (!showFilters) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersPanelRef.current && !filtersPanelRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  // Ref per il filtro client: si legge dentro fetchStoresAndLogs senza metterlo nelle deps
  const selectedClientIdRef = useRef<number | null>(null);
  selectedClientIdRef.current = selectedClientId; // aggiornato ad ogni render, prima degli effetti

  // Ultimo centro usato per la fetch dei pin (aggiornato dentro fetchStoresAndLogs)
  const lastFetchCenter = useRef<[number, number] | null>(null);
  // Timestamp dell'ultima fetch effettiva: serve a dedup chiamate ravvicinate
  // (es. handleSelectLocation che chiama il fetch + moveend che lo rifa).
  const lastFetchTsRef = useRef<number>(0);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // True mentre stiamo recuperando i pin dalla RPC: alimenta la pill di loading.
  const [isLoadingStores, setIsLoadingStores] = useState(false);

  // Riferimento al Leaflet Map: usato dal tasto "ricentrami" per fare flyTo
  // senza dover passare per `selectedLocation` (che resetterebbe lo zoom a 16).
  const mapRef = useRef<L.Map | null>(null);
  // True quando la posizione utente non è più dentro il viewport: alimenta il
  // bottone "torna alla mia posizione".
  const [isAwayFromUser, setIsAwayFromUser] = useState(false);

  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, logo')
        .order('id', { ascending: true });
      if (!error && data) setClients(data);
    };
    loadClients();
  }, [supabase]);


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
            notes: (['failed', 'non_existent'].includes(newStatus) && note) ? note : null,
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
      // Dedup anti doppio-fetch: se siamo stati chiamati pochissimo tempo fa
      // con coordinate praticamente identiche, è un duplicato (tipico caso:
      // handleSelectLocation triggera un fetch esplicito + Leaflet emette poi
      // moveend dopo flyTo). La finestra deve coprire la durata dell'animazione
      // flyTo (~800ms) + il debounce del moveend (250ms) + buffer.
      const now = Date.now();
      const prev = lastFetchCenter.current;
      if (
        prev &&
        now - lastFetchTsRef.current < 1500 &&
        Math.abs(prev[0] - lat) < 1e-4 && // ~10 metri di tolleranza
        Math.abs(prev[1] - lng) < 1e-4
      ) {
        return;
      }
      lastFetchTsRef.current = now;
      lastFetchCenter.current = [lat, lng];

      setIsLoadingStores(true);
      try {
        // Legge il filtro client dal ref (non nelle deps → questa funzione non si ricrea al cambio filtro)
        const rpcParams: { lat: number; lng: number; radius: number; p_client_id?: number; p_limit?: number } = {
          lat,
          lng,
          radius: 800,
          p_limit: 80,
        };
        if (selectedClientIdRef.current != null) {
          rpcParams.p_client_id = selectedClientIdRef.current;
        }

        const { data: storesData, error: rpcError } = await supabase.rpc(
          'get_stores_within_radius',
          rpcParams
        );

        if (rpcError) {
          console.error('get_stores_within_radius error:', rpcError);
          return;
        }

        // La visibilità è ora gestita interamente lato DB (RLS + RPC),
        // quindi `storesData` contiene già solo gli store visibili all'utente.
        const storesWithLogs = await Promise.all(
          (storesData ?? []).map(async (store: any) => {
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
            let modifierId: string | undefined;
            if (modifiedByOtherUser && logs && logs.length > 0) {
              const otherUserLog = logs.find((log) => log.modifier !== user.id);
              if (otherUserLog) {
                modifierId = otherUserLog.modifier;
                const userInfo = await fetchUserInfo(otherUserLog.modifier);
                if (userInfo) {
                  modifierName = `${userInfo.name} ${userInfo.surname}`;
                }
              }
            }

            return { ...store, modifiedByOtherUser, modifierName, modifierId };
          })
        );

        // Merge "stabile": se uno store esisteva già e i campi visualizzati
        // non sono cambiati, manteniamo la STESSA reference dell'oggetto.
        // Così il <Marker> sottostante non viene rimontato dal MarkerClusterGroup
        // → niente flickering, e il <Popup> eventualmente aperto resta tale.
        setStores((prevStores) => {
          // Nota: niente `new Map(...)` perché in questo file `Map` è il
          // componente di react-leaflet importato sopra → conflitto di nomi.
          const prevById: Record<number, Store> = {};
          for (const s of prevStores) prevById[s.id] = s;
          return storesWithLogs.map((s: Store) => {
            const existing = prevById[s.id];
            if (
              existing &&
              existing.location === s.location &&
              existing.status === s.status &&
              existing.tier === s.tier &&
              existing.client_id === s.client_id &&
              existing.client_logo === s.client_logo &&
              existing.modifiedByOtherUser === s.modifiedByOtherUser &&
              existing.modifierId === s.modifierId &&
              existing.modifierName === s.modifierName
            ) {
              return existing;
            }
            return s;
          });
        });
      } finally {
        setIsLoadingStores(false);
      }
    },
    [supabase, user.id] // selectedClientId RIMOSSO: si legge dal ref → questa callback non si ricrea al cambio filtro
  );

  useEffect(() => {
    // Fetch user's name
    const getUserName = async () => {
      const { data: userData, error } = await supabase
        .from('users')
        .select('name, surname, number, role')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user info:', error);
      } else if (userData) {
        setAgent(userData);
        const role = userData.role as GovernanceLevel | null;
        if (role === 'agent' || role === 'am' || role === 'supervisor') {
          setGovernanceLevel(role);
        }
      }
    };

    // Set timeout for geolocation message
    const geoTimeout = setTimeout(() => {
      if (!coord) {
        setShowGeoMessage(true);
      }
    }, 3000);

    // Fallback timeout: se dopo 10 secondi non abbiamo coordinate, usa Roma
    fallbackTimeoutRef.current = setTimeout(() => {
      setCoord((current) => {
        // Solo se non abbiamo ancora coordinate (evita di sovrascrivere la posizione già ottenuta)
        if (current == null) {
          const defaultCoords: LatLngExpression = [41.90914449596167, 12.524449000864948];
          fetchStoresAndLogs(defaultCoords[0], defaultCoords[1]);
          return defaultCoords;
        }
        return current;
      });
    }, 10000);

    getMyLoc((coords: LatLngExpression | null) => {
      if (coords && Array.isArray(coords)) {
        if (fallbackTimeoutRef.current != null) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }
        setCoord(coords);
        fetchStoresAndLogs(coords[0], coords[1]);
      }
    });

    getUserName();

    return () => {
      clearTimeout(geoTimeout);
      if (fallbackTimeoutRef.current != null) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };
  }, [user.id, supabase, fetchStoresAndLogs]);

  // Per AM: calcola quali modifier (agenti) sono nella mia area → mostriamo il nome solo per quelli
  useEffect(() => {
    if (governanceLevel !== 'am' || stores.length === 0) {
      if (governanceLevel !== 'am') setModifierShowNameSet(new Set());
      return;
    }
    const modifierIds = Array.from(
      new Set(
        stores
          .filter((s: any) => s.modifiedByOtherUser && s.modifierId)
          .map((s: any) => s.modifierId as string)
      )
    );
    if (modifierIds.length === 0) {
      setModifierShowNameSet(new Set());
      return;
    }
    (async () => {
      const { data: myAreas } = await supabase
        .from('user_areas')
        .select('area_id')
        .eq('user_id', user.id);
      const myAreaIds = new Set((myAreas ?? []).map((r) => String(r.area_id)));
      if (myAreaIds.size === 0) {
        setModifierShowNameSet(new Set());
        return;
      }
      const { data: modifierAreas } = await supabase
        .from('user_areas')
        .select('user_id, area_id')
        .in('user_id', modifierIds);
      const showSet = new Set<string>();
      (modifierAreas ?? []).forEach((r: { user_id: string; area_id: number }) => {
        if (myAreaIds.has(String(r.area_id))) showSet.add(r.user_id);
      });
      setModifierShowNameSet(showSet);
    })();
  }, [governanceLevel, stores, user.id, supabase]);

  // Al cambio filtro richiama la fetch con l'ultimo centro usato (non con coord che è la posizione persona)
  useEffect(() => {
    if (lastFetchCenter.current) {
      fetchStoresAndLogs(lastFetchCenter.current[0], lastFetchCenter.current[1]);
    }
  }, [selectedClientId, fetchStoresAndLogs]);

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
    // Atterrando programmaticamente sulla nuova posizione tramite `setView`,
    // l'evento `moveend` di Leaflet non è garantito (timing race con il commit
    // di React). Triggeriamo subito il fetch così i pin compaiono senza dover
    // muovere la mappa. Eventuale doppio fetch da moveend è idempotente.
    fetchStoresAndLogs(newLocation[0], newLocation[1]);
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
          <div className='absolute top-4 left-4 z-[1000] w-[calc(100vw-2rem)] max-w-[420px] pointer-events-auto space-y-2'>
            {/* Address search */}
            <div className='flex items-center gap-2'>
              <div className='relative flex-1'>
                <Input
                  type='text'
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder='Cerca indirizzo...'
                  className='w-full px-4 py-2 pl-10 border rounded-full shadow-md bg-white text-black'
                  style={{ backgroundColor: 'white', color: 'black' }}
                />
                <Search className='absolute left-3 top-2.5 h-5 w-5 text-gray-400' />

                {/* Loading indicator */}
                {isSearching && (
                  <div className='absolute right-3 top-2.5'>
                    <Loader className='h-5 w-5 animate-spin text-gray-400' />
                  </div>
                )}
              </div>
            </div>

            {/* Risultati ricerca indirizzo (sopra al tasto Filtri) */}
            {searchResults.length > 0 && showSearchResults && (
              <div className='w-full shadow-lg max-h-60 overflow-auto rounded-md bg-white'>
                {searchResults.map((result, index) => (
                  <Button
                    key={index}
                    variant='outline'
                    className={`w-full px-4 py-1 text-left flex justify-start border-none focus:outline-none rounded-none ${
                      index === 0 ? 'rounded-t-md' : ''
                    } ${index === searchResults.length - 1 ? 'rounded-b-md' : ''} ${
                      focusedIndex === index ? 'bg-accent text-accent-foreground' : ''
                    }`}
                    onClick={() => handleSelectLocation(result)}
                  >
                    <MapPin className='h-4 w-4 text-gray-400 flex-shrink-0' />
                    <p className='text-sm truncate'>{result.display_name}</p>
                  </Button>
                ))}
              </div>
            )}

            {/* Filter button + panel */}
            <div className='relative' ref={filtersPanelRef}>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='rounded-full text-xs flex items-center gap-1.5 shadow-md'
                style={{
                  backgroundColor: (selectedClientId != null || selectedTiers.size > 0) ? '#224677' : 'white',
                  borderColor: '#224677',
                  color: (selectedClientId != null || selectedTiers.size > 0) ? 'white' : '#224677',
                }}
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter className='h-3 w-3' />
                Filtri
                {(selectedClientId != null || selectedTiers.size > 0) && (
                  <span className='bg-white text-[#224677] rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold'>
                    {(selectedClientId != null ? 1 : 0) + selectedTiers.size}
                  </span>
                )}
              </Button>

              {showFilters && (
                <div
                  className='absolute top-full mt-2 left-0 bg-white rounded-xl shadow-2xl p-4 z-[10000] min-w-[280px]'
                  style={{ border: '1px solid #e5e7eb' }}
                >
                  <div className='flex items-center justify-between mb-3'>
                    <span className='text-sm font-semibold text-gray-800'>Filtri</span>
                    <button onClick={() => setShowFilters(false)} className='text-gray-400 hover:text-gray-600'>
                      <X className='h-4 w-4' />
                    </button>
                  </div>

                  {/* Cliente */}
                  <p className='text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2'>Cliente</p>
                  <div className='flex flex-wrap gap-1.5 mb-4'>
                    <button
                      className='rounded-full text-xs px-3 py-1 border transition-colors'
                      style={{
                        backgroundColor: selectedClientId == null ? '#224677' : 'white',
                        borderColor: '#224677',
                        color: selectedClientId == null ? 'white' : '#224677',
                      }}
                      onClick={() => setSelectedClientId(null)}
                    >
                      Tutti
                    </button>
                    {clients.map((c) => {
                      const logoUrl = getClientLogoUrl(c.logo);
                      return (
                        <button
                          key={c.id}
                          className='rounded-full text-xs px-3 py-1 border flex items-center gap-1.5 transition-colors'
                          style={{
                            backgroundColor: selectedClientId === c.id ? '#224677' : 'white',
                            borderColor: '#224677',
                            color: selectedClientId === c.id ? 'white' : '#224677',
                          }}
                          onClick={() => setSelectedClientId(c.id)}
                        >
                          {logoUrl && (
                            <span className='w-4 h-4 rounded-full overflow-hidden flex-shrink-0 bg-gray-200'>
                              <img src={logoUrl} alt='' className='w-full h-full object-cover' />
                            </span>
                          )}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tier */}
                  <p className='text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2'>Tier</p>
                  <div className='flex flex-wrap gap-1.5'>
                    {(
                      [
                        { value: null,     label: 'Tutti',  dot: null },
                        { value: 'gold+',  label: 'Gold+',  dot: '#FFA500' },
                        { value: 'gold',   label: 'Gold',   dot: '#FFD700' },
                        { value: 'silver', label: 'Silver', dot: '#C0C0C0' },
                        { value: 'bronze', label: 'Bronze', dot: '#CD7F32' },
                      ] as { value: string | null; label: string; dot: string | null }[]
                    ).map(({ value, label, dot }) => {
                      const isActive = value === null ? selectedTiers.size === 0 : selectedTiers.has(value);
                      return (
                        <button
                          key={label}
                          className='rounded-full text-xs px-3 py-1 border flex items-center gap-1.5 transition-colors'
                          style={{
                            backgroundColor: isActive ? (dot ?? '#224677') : 'white',
                            borderColor: dot ?? '#224677',
                            color: isActive ? 'white' : '#374151',
                          }}
                          onClick={() => {
                            if (value === null) {
                              setSelectedTiers(new Set());
                            } else {
                              setSelectedTiers((prev) => {
                                const next = new Set(prev);
                                if (next.has(value)) next.delete(value);
                                else next.add(value);
                                return next;
                              });
                            }
                          }}
                        >
                          {dot && (
                            <span
                              className='w-2 h-2 rounded-full flex-shrink-0'
                              style={{
                                backgroundColor: isActive ? 'rgba(255,255,255,0.8)' : dot,
                                border: '1px solid rgba(0,0,0,0.1)',
                              }}
                            />
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tier color toggle */}
                  <div className='mt-4 pt-3 border-t border-gray-100 flex items-center justify-between'>
                    <span className='text-xs text-gray-600'>Colori tier sui pin</span>
                    <button
                      onClick={() => setShowTierColors((v) => !v)}
                      className='relative inline-flex h-5 w-9 items-center rounded-full transition-colors'
                      style={{ backgroundColor: showTierColors ? '#224677' : '#d1d5db' }}
                    >
                      <span
                        className='inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform'
                        style={{ transform: showTierColors ? 'translateX(18px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>

                  {/* Reset */}
                  {(selectedClientId != null || selectedTiers.size > 0) && (
                    <button
                      className='mt-3 w-full text-xs text-gray-400 hover:text-gray-600 underline'
                      onClick={() => { setSelectedClientId(null); setSelectedTiers(new Set()); }}
                    >
                      Rimuovi tutti i filtri
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pill di loading stile Google Maps: appare durante il fetch dei pin
            (sia per pan/zoom che per atterraggio dopo ricerca indirizzo). */}
        {isLoadingStores && (
          <div
            className='pointer-events-none absolute left-1/2 top-4 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm text-gray-700 shadow-lg backdrop-blur-sm'
            role='status'
            aria-live='polite'
          >
            <Loader className='h-4 w-4 animate-spin' style={{ color: '#224677' }} />
            <span>Caricamento punti vendita…</span>
          </div>
        )}

        {coord ? (
          <MapContainer
            ref={mapRef}
            style={{
              height: '100%',
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
            {Array.isArray(coord) && (
              <UserLocationTracker
                userCoord={coord as [number, number]}
                onVisibilityChange={setIsAwayFromUser}
              />
            )}
            <TileLayer url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' />
            <ZoomControl position='bottomright' />

            {/* Marker for the user's current location */}
            <Marker icon={navIcon} position={coord}>
              <Popup>
                Ciao {agent?.name}, utilizza la mappa per trovare le opportunità
                di vendita più vicine a te.
              </Popup>
            </Marker>

            {/* Cluster + individual markers */}
            <MarkerClusterGroup
              iconCreateFunction={createClusterIcon}
              maxClusterRadius={60}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              zoomToBoundsOnClick
              disableClusteringAtZoom={16}
              minimumClusterSize={10}
            >
            {stores
              .filter((store) =>
                selectedTiers.size === 0 ||
                (store.tier != null && selectedTiers.has(store.tier))
              )
              .map((store) => {
              const storeCoordinates = parseCoords(store.location);
              if (!storeCoordinates) return null; // Skip rendering if coordinates are invalid

              const clientLogoUrl =
                store.status === 'free' ? getClientLogoUrl(store.client_logo) : null;

              const tierFillColor = (showTierColors && store.tier)
                ? (TIER_COLORS[(store.tier as string).toLowerCase() as keyof typeof TIER_COLORS] ?? null)
                : null;

              const icon = store.modifiedByOtherUser
                ? store.status === 'free'
                  ? tierFillColor && clientLogoUrl
                    ? createFreePinColoredWithLogo(tierFillColor, clientLogoUrl, true)  // tier color + logo
                    : tierFillColor
                      ? createFreePinColored(tierFillColor, true)                       // tier color only
                      : clientLogoUrl
                        ? createFreePinMutedWithLogo(clientLogoUrl)                     // logo only
                        : freePinM                                                       // default
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
                  ? tierFillColor && clientLogoUrl
                    ? createFreePinColoredWithLogo(tierFillColor, clientLogoUrl)        // tier color + logo
                    : tierFillColor
                      ? createFreePinColored(tierFillColor)                             // tier color only
                      : clientLogoUrl
                        ? createFreePinWithLogo(clientLogoUrl)                          // logo only
                        : freePin                                                        // default
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

              const finalIcon = icon;

              return store.modifiedByOtherUser ? (
                <Marker key={store.id} position={storeCoordinates} icon={finalIcon}>
                  <Popup>
                    {governanceLevel === 'agent' ? (
                      <>In questo punto vendita è in corso una trattativa.</>
                    ) : governanceLevel === 'supervisor' ||
                      (governanceLevel === 'am' &&
                        'modifierId' in store &&
                        store.modifierId &&
                        modifierShowNameSet.has(store.modifierId)) ? (
                      <>
                        In questo punto vendita è in corso una trattativa gestita
                        da
                        {store.modifierName
                          ? ` ${store.modifierName}`
                          : ' un altro agente'}
                        .
                      </>
                    ) : (
                      <>In questo punto vendita è in corso una trattativa.</>
                    )}
                  </Popup>
                </Marker>
              ) : (
                <Marker key={store.id} position={storeCoordinates} icon={finalIcon}>
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
            </MarkerClusterGroup>
          </MapContainer>
        ) : null}

        {/* Bottone "torna alla mia posizione": appare solo quando la posizione
            utente è uscita dal viewport, scompare appena la rivedi sulla mappa.
            Posizionato sopra il ZoomControl (bottom-right) con padding coerente. */}
        {coord && Array.isArray(coord) && isAwayFromUser && (
          <button
            type='button'
            onClick={() => {
              const m = mapRef.current;
              if (!m) return;
              m.closePopup();
              m.flyTo(coord as [number, number], Math.max(m.getZoom(), 14), {
                duration: 0.8,
              });
            }}
            aria-label='Torna alla mia posizione'
            title='Torna alla mia posizione'
            className='absolute bottom-24 right-2.5 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-black/10 transition-colors hover:bg-gray-50 active:bg-gray-100'
          >
            <LocateFixed className='h-5 w-5' style={{ color: '#224677' }} />
          </button>
        )}

        {!coord && (
          <div className='flex-1 w-full flex flex-col items-center justify-center'>
            <Loader className='h-8 w-8 animate-spin text-[#1B304E] mb-4' />
            <p className='text-lg font-medium'>Caricamento mappa...</p>
            <p className='text-sm mt-2'>
              Attendi mentre recuperiamo la tua posizione
            </p>
            {showGeoMessage && (
              <p className='text-sm mt-4 text-muted-foreground max-w-md text-center'>
                Se la mappa non carica, verifica di aver dato i permessi di
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
