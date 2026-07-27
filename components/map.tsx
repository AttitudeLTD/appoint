'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Filter,
  Loader,
  LocateFixed,
  MapPin,
  Search,
  Store as StoreIcon,
  X,
} from 'lucide-react';

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
import { effectiveStoreStatus } from '@/utils/store-status';
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

// Risultato "punto vendita" della ricerca per nome (sorgente: tabella stores,
// via Supabase con RLS → l'utente vede solo i negozi che può già vedere).
type StoreSearchResult = {
  id: number;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
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

// Search bar isolata: tutto lo stato del campo "cerca indirizzo" vive qui.
// In questo modo, ad ogni keystroke rerenda SOLO questo componente e non
// l'intero <Map />, evitando il flickering della cluster layer e dei marker
// (le ombre dei pin lampeggiavano perché il MarkerClusterGroup si rifaceva
// ad ogni cambio di searchQuery nel parent).
function AddressSearchBar({
  onSelect,
}: {
  onSelect: (lat: number, lng: number) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [storeResults, setStoreResults] = useState<StoreSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showSearchResults, setShowSearchResults] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Lista unificata su cui agiscono tastiera e click: prima i punti vendita
  // (match esatto sui nostri dati), poi gli indirizzi da Nominatim.
  const combinedResults = useMemo(
    () => [
      ...storeResults.map((s) => ({ kind: 'store' as const, store: s })),
      ...searchResults.map((r) => ({ kind: 'address' as const, address: r })),
    ],
    [storeResults, searchResults]
  );

  useEffect(() => {
    setFocusedIndex(-1);
  }, [combinedResults]);

  // Chiude il dropdown quando l'utente clicca fuori (es. sulla mappa).
  // Prima questa logica viveva in un MapClickHandler nel parent.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setStoreResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);

      // Indirizzi: Nominatim (comportamento preesistente, invariato).
      const addressPromise = (async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              q
            )}&limit=5&countrycodes=it&accept-language=it`,
            { signal: controller.signal }
          );
          const data = await response.json();
          if (!controller.signal.aborted) setSearchResults(data);
        } catch (error: any) {
          if (error?.name !== 'AbortError') {
            console.error('Error searching address:', error);
          }
        }
      })();

      // Punti vendita: ricerca lato SERVER via RPC `search_stores_by_name`
      // (migration 20260727170000). Non si scarica mai l'intero dataset sul
      // client e non si filtra client-side.
      //
      // Perché una RPC e non più `from('stores').ilike(...)`:
      //  1. la query diretta passa dalla RLS di `stores`, che inietta
      //     `user_can_see_store` per riga → il planner sceglieva un Seq Scan e
      //     l'indice trigram non veniva MAI usato (706 ms e 132.737 buffer su
      //     ~14,6k store, con costo lineare sul totale dei negozi);
      //  2. la query diretta non applicava `clients.show_on_map`, quindi
      //     restituiva negozi che sulla mappa non hanno alcun pin;
      //  3. `stores.location` letta dalla tabella arriva come WKB esadecimale,
      //     che `parseCoords` non sa leggere → ogni risultato veniva scartato.
      //     La RPC ritorna `ST_AsText`, cioè `POINT(lng lat)`.
      //
      // Il minimo di 2 caratteri, il cap sui risultati e la neutralizzazione
      // dei wildcard LIKE sono ora imposti ANCHE lato server, dentro la RPC.
      const storePromise = (async () => {
        if (q.length < 2) {
          setStoreResults([]);
          return;
        }
        try {
          const { data, error } = await supabase.rpc('search_stores_by_name', {
            p_query: q,
            p_limit: 6,
          });
          if (error) {
            console.error('Error searching stores by name:', error);
            return;
          }
          if (controller.signal.aborted) return;
          const mapped = (data ?? [])
            .map((s: any) => {
              const c = parseCoords(s.location);
              if (!c) return null;
              return {
                id: s.id as number,
                name: (s.name as string) ?? '',
                subtitle: [s.address, s.comune, s.provincia ? `(${s.provincia})` : '']
                  .filter(Boolean)
                  .join(' '),
                lat: c[0],
                lng: c[1],
              } as StoreSearchResult;
            })
            .filter(Boolean) as StoreSearchResult[];
          setStoreResults(mapped);
        } catch (error) {
          console.error('Unexpected error searching stores:', error);
        }
      })();

      try {
        await Promise.all([addressPromise, storePromise]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery, supabase]);

  const clearSearch = () => {
    setSearchResults([]);
    setStoreResults([]);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleSelect = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    clearSearch();
    onSelect(lat, lng);
  };

  // Selezione di un punto vendita: atterriamo sulle sue coordinate esattamente
  // come per un indirizzo, quindi il pin entra nel raggio di caricamento e si
  // può aprire il popup. Nessuna logica di fetch duplicata.
  const handleSelectStore = (s: StoreSearchResult) => {
    clearSearch();
    onSelect(s.lat, s.lng);
  };

  const handleSelectIndex = (i: number) => {
    const item = combinedResults[i];
    if (!item) return;
    if (item.kind === 'store') handleSelectStore(item.store);
    else handleSelect(item.address);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (combinedResults.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < combinedResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          handleSelectIndex(focusedIndex);
        }
        break;
    }
  };

  return (
    <div ref={containerRef} className='space-y-2'>
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
            placeholder='Cerca punto vendita o indirizzo...'
            className='w-full px-4 py-2 pl-10 border rounded-full shadow-md bg-white text-black'
            style={{ backgroundColor: 'white', color: 'black' }}
          />
          <Search className='absolute left-3 top-2.5 h-5 w-5 text-gray-400' />
          {isSearching && (
            <div className='absolute right-3 top-2.5'>
              <Loader className='h-5 w-5 animate-spin text-gray-400' />
            </div>
          )}
        </div>
      </div>

      {combinedResults.length > 0 && showSearchResults && (
        <div className='w-full shadow-lg max-h-60 overflow-auto rounded-md bg-white'>
          {storeResults.length > 0 && (
            <p className='px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400'>
              Punti vendita
            </p>
          )}
          {combinedResults.map((item, index) => {
            // Intestazione "Indirizzi" prima del primo risultato Nominatim.
            const isFirstAddress =
              item.kind === 'address' && index === storeResults.length;
            return (
              <div key={item.kind === 'store' ? `s-${item.store.id}` : `a-${index}`}>
                {isFirstAddress && (
                  <p className='px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-t'>
                    Indirizzi
                  </p>
                )}
                <Button
                  variant='outline'
                  className={`w-full px-4 py-1 text-left flex justify-start border-none focus:outline-none rounded-none ${
                    focusedIndex === index ? 'bg-accent text-accent-foreground' : ''
                  }`}
                  onClick={() => handleSelectIndex(index)}
                >
                  {item.kind === 'store' ? (
                    <>
                      <StoreIcon className='h-4 w-4 text-gray-400 flex-shrink-0' />
                      <span className='min-w-0 flex flex-col items-start'>
                        <span className='text-sm truncate max-w-full'>
                          {item.store.name}
                        </span>
                        {item.store.subtitle && (
                          <span className='text-[11px] text-gray-500 truncate max-w-full'>
                            {item.store.subtitle}
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <MapPin className='h-4 w-4 text-gray-400 flex-shrink-0' />
                      <p className='text-sm truncate'>{item.address.display_name}</p>
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

// Parametri di caricamento pin.
// Vista libera (nessun filtro cliente): raggio moderato attorno al centro mappa
// (caricamento leggero, index-assisted grazie all'indice GIST su stores.location).
const DEFAULT_RADIUS_M = 2000; // ~2 km
const DEFAULT_LIMIT = 250;
// Con uno o più filtri cliente attivi carichiamo in base al VIEWPORT corrente
// (raggio derivato dai bounds della mappa) con un cap più alto: così, dopo il
// dezoom automatico sull'estensione dei clienti selezionati, si vede l'intera
// distribuzione e non solo i pin entro 2 km dal centro.
const CLIENT_LIMIT = 2000;
const CLIENT_MAX_RADIUS_M = 2500000; // cap di sicurezza (~Italia intera)

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
  // Esito manage_form più recente per negozio (solo per i pin già caricati).
  // Serve a colorare il pin col BUCKET giusto: per i clienti con `lock_pin`
  // (AiCall) `stores.status` resta per sempre `in_progress` e da solo non dice
  // nulla sull'esito reale. Chiave assente = nessun esito noto.
  const [storeEsiti, setStoreEsiti] = useState<{ [key: number]: string | null }>({});
  const [statusLogs, setStatusLogs] = useState<{ [key: number]: StoreLog[] }>(
    {}
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false); // For in-progress limit dialog
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<[number, number]>();
  const [showGeoMessage, setShowGeoMessage] = useState(false);
  const [governanceLevel, setGovernanceLevel] = useState<GovernanceLevel>('am'); // populated from users.role
  const [clients, setClients] = useState<{ id: number; name: string; logo?: string | null }[]>([]);
  // Multi-select: insieme degli id cliente selezionati. Vuoto = "Tutti".
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());

  // Id del cliente "Scalapay" (rilevato per nome): i tier sono un suo concetto,
  // quindi il filtro Tier compare solo quando Scalapay è tra i clienti visibili.
  const scalapayId = useMemo(
    () => clients.find((c) => /scalapay/i.test(c.name))?.id ?? null,
    [clients]
  );
  // Il filtro Tier ha senso quando: nessun filtro cliente attivo (si vede tutto,
  // Scalapay incluso) OPPURE Scalapay è esplicitamente selezionato.
  const showTierFilter =
    selectedClientIds.size === 0 ||
    (scalapayId != null && selectedClientIds.has(scalapayId));
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
  // Filtro cliente (multi) letto dentro fetchStoresAndLogs senza metterlo nelle
  // deps → la callback non si ricrea ad ogni cambio filtro.
  const selectedClientIdsRef = useRef<number[]>([]);
  selectedClientIdsRef.current = Array.from(selectedClientIds);

  // Ultimo centro usato per la fetch dei pin (aggiornato dentro fetchStoresAndLogs)
  const lastFetchCenter = useRef<[number, number] | null>(null);
  // Timestamp dell'ultima fetch effettiva: serve a dedup chiamate ravvicinate
  // (es. handleSelectLocation che chiama il fetch + moveend che lo rifa).
  const lastFetchTsRef = useRef<number>(0);
  // Raggio (m) usato nell'ultima fetch: fa parte della chiave di dedup. Senza di
  // esso uno zoom-out (che NON muove il centro) veniva scartato come duplicato e
  // i pin caricati con il raggio più piccolo restavano gli unici visibili.
  const lastFetchRadiusRef = useRef<number | null>(null);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sequence guard anti-race: ogni fetch incrementa il contatore; quando una
  // risposta torna, se nel frattempo è partita una fetch più recente, la
  // risposta vecchia viene scartata (evita pin "fuori ordine" sui pan veloci).
  const fetchSeqRef = useRef(0);
  // Diventa true dopo aver caricato i filtri salvati: evita che il primo render
  // (stato vuoto) sovrascriva in localStorage la selezione persistita.
  const filtersLoadedRef = useRef(false);

  // True mentre stiamo recuperando i pin dalla RPC: alimenta la pill di loading.
  const [isLoadingStores, setIsLoadingStores] = useState(false);

  // Riferimento al Leaflet Map: usato dal tasto "ricentrami" per fare flyTo
  // senza dover passare per `selectedLocation` (che resetterebbe lo zoom a 16).
  const mapRef = useRef<L.Map | null>(null);
  // True quando la posizione utente non è più dentro il viewport: alimenta il
  // bottone "torna alla mia posizione".
  const [isAwayFromUser, setIsAwayFromUser] = useState(false);

  // Clienti selezionabili nel filtro della mappa. Solo quelli con
  // `clients.show_on_map = true`: un cliente escluso dalla mappa (oggi Amex) non
  // ha pin da mostrare, quindi offrirlo come filtro darebbe una mappa vuota.
  // Il criterio sta sul DB — nessun id hardcoded qui: per riattivarlo basta
  // `update clients set show_on_map = true where id = …`, senza deploy.
  // NB: le altre letture di `clients` NON filtrano (export supervisor della
  // dashboard, form "Nuovo Punto Vendita"), perché lì il cliente serve ancora.
  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, logo')
        .eq('show_on_map', true)
        .order('id', { ascending: true });
      if (!error && data) setClients(data);
    };
    loadClients();
  }, [supabase]);


  const handleStatusChangeAttempt = useCallback(async (
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
  }, [supabase, user.id]);

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

  // Lock "esito" (manage_form con `lock_pin`, es. PROGETTO AICALL): al salvataggio
  // dell'esito il pin viene preso in carico → status `in_progress`, SENZA dialog
  // di conferma e SENZA il limite dei 10 pin. Aggiorna DB (stores + log del
  // modificatore) e lo stato locale (icona sulla mappa + storeStatuses), così il
  // pin risulta subito esitato per l'autore e bloccato per gli altri agenti.
  const applyEsitoLock = useCallback(async (storeId: number, prevStatus: string) => {
    const { error } = await supabase
      .from('stores')
      .update({ status: 'in_progress' })
      .eq('id', storeId);
    if (error) {
      console.error('Errore lock esito:', error);
      return;
    }
    await supabase.from('store_status_logs').insert([
      { store_id: storeId, prev: prevStatus || 'free', new: 'in_progress', modifier: user.id },
    ]);
    setStoreStatuses((prev) => ({ ...prev, [storeId]: 'in_progress' }));
    setStores(
      (prev) =>
        prev.map((s) => (s.id === storeId ? { ...s, status: 'in_progress' } : s)) as Store[]
    );
  }, [supabase, user.id]);

  // Esito appena salvato dal pannello "Gestisci": aggiorna in memoria SOLO il
  // negozio interessato → il pin si ricolora all'istante, senza rifare la RPC
  // dei pin. È il caso del RI-esito, dove `stores.status` non cambia
  // (resta `in_progress`) e l'unica informazione nuova è appunto l'esito.
  const handleOutcomeSaved = useCallback((storeId: number, esito: string | null) => {
    setStoreEsiti((prev) =>
      prev[storeId] === esito ? prev : { ...prev, [storeId]: esito }
    );
  }, []);

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

  const fetchStatusLogs = useCallback(async (storeId: number, offset: number = 0) => {
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
  }, [supabase]);

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

  // Raggio (in metri) che copre il viewport corrente: mezza diagonale, ovvero
  // distanza dal centro all'angolo nord-est dei bounds. Usato in modalità filtro
  // cliente per caricare tutta l'area visibile dopo il dezoom automatico.
  const viewportRadiusMeters = useCallback((): number | null => {
    const map = mapRef.current;
    if (!map) return null;
    const b = map.getBounds();
    return b.getCenter().distanceTo(b.getNorthEast());
  }, []);

  const fetchStoresAndLogs = useCallback(
    async (lat: number, lng: number, radiusOverride?: number) => {
      // Dedup anti doppio-fetch: se siamo stati chiamati pochissimo tempo fa
      // con coordinate praticamente identiche, è un duplicato (tipico caso:
      // handleSelectLocation triggera un fetch esplicito + Leaflet emette poi
      // moveend dopo flyTo). La finestra deve coprire la durata dell'animazione
      // flyTo (~800ms) + il debounce del moveend (250ms) + buffer.
      // Legge il filtro client (multi) dal ref (non nelle deps → la callback
      // non si ricrea al cambio filtro).
      const clientIds = selectedClientIdsRef.current;
      const hasClientFilter = clientIds.length > 0;

      // Raggio effettivo di QUESTA fetch. Va calcolato prima del dedup perché ne
      // fa parte: con filtro cliente il raggio dipende dallo zoom, quindi due
      // fetch sullo stesso centro ma con zoom diversi NON sono duplicati.
      const effectiveRadius = hasClientFilter
        ? Math.min(
            radiusOverride ?? viewportRadiusMeters() ?? DEFAULT_RADIUS_M,
            CLIENT_MAX_RADIUS_M
          )
        : DEFAULT_RADIUS_M;

      const now = Date.now();
      const prev = lastFetchCenter.current;
      const prevRadius = lastFetchRadiusRef.current;
      const sameCenter =
        prev != null &&
        Math.abs(prev[0] - lat) < 1e-4 && // ~10 metri di tolleranza
        Math.abs(prev[1] - lng) < 1e-4;

      // Questa RPC resta la chiamata più pesante della mappa: va invocata solo
      // quando servono davvero dati nuovi, altrimenti si saturano le connessioni.
      // (Dal 2026-07-27 il filtro di visibilità è insiemistico e non più valutato
      // riga per riga: ~120 ms con filtro cliente attivo, contro i ~1,4 s per
      // cliente di prima. Vedi supabase/SCHEMA.md → Changelog 2026-07-27 (b).
      // La logica di dedup qui sotto resta comunque valida e va mantenuta.)
      //
      // Regola 1 — zoom IN a centro invariato: il raggio si restringe, quindi il
      // set già in memoria è un SOVRAINSIEME di quello che serve. Nessuna fetch,
      // senza limite di tempo. (Prima si rifaceva la query per ottenere meno
      // dati di quelli che avevamo già.)
      if (sameCenter && prevRadius != null && effectiveRadius <= prevRadius * 1.05) {
        return;
      }
      // Regola 2 — chiamate ravvicinate identiche (centro e raggio invariati):
      // tipico di handleSelectLocation che fa il fetch esplicito + il moveend
      // successivo al flyTo. Throttle a 1,5 s come in origine.
      const sameRadius =
        prevRadius != null &&
        Math.abs(prevRadius - effectiveRadius) <= prevRadius * 0.05;
      if (sameCenter && sameRadius && now - lastFetchTsRef.current < 1500) {
        return;
      }
      lastFetchTsRef.current = now;
      lastFetchCenter.current = [lat, lng];
      lastFetchRadiusRef.current = effectiveRadius;

      const seq = ++fetchSeqRef.current; // questa è la fetch più recente

      setIsLoadingStores(true);
      try {

        // NB: usiamo SEMPRE il parametro `p_client_id` (singolo), che PostgREST
        // conosce da sempre → robusto rispetto alla schema-cache. Per il
        // multi-select facciamo una chiamata per cliente in parallelo e uniamo.
        let storesList: any[];
        if (hasClientFilter) {
          // Raggio = override (= estensione, passato al cambio selezione) oppure
          // mezza diagonale del viewport corrente (durante pan/zoom). Capped.
          // Già calcolato sopra come `effectiveRadius` (fa parte del dedup).
          const radius = effectiveRadius;
          const perClient = await Promise.all(
            clientIds.map((cid) =>
              supabase.rpc('get_stores_within_radius', {
                lat,
                lng,
                radius,
                p_client_id: cid,
                p_limit: CLIENT_LIMIT,
              })
            )
          );
          const firstErr = perClient.find((r) => r.error)?.error;
          if (firstErr) {
            console.error('get_stores_within_radius error:', firstErr);
            return;
          }
          // Merge + dedup per id (uno store può appartenere a più clienti).
          const byId: Record<number, any> = {};
          for (const r of perClient) for (const s of r.data ?? []) byId[s.id] = s;
          storesList = Object.values(byId);
        } else {
          // Vista libera: raggio moderato attorno al centro.
          const { data, error: rpcError } = await supabase.rpc(
            'get_stores_within_radius',
            { lat, lng, radius: DEFAULT_RADIUS_M, p_limit: DEFAULT_LIMIT }
          );
          if (rpcError) {
            console.error('get_stores_within_radius error:', rpcError);
            return;
          }
          storesList = (data ?? []) as any[];
        }

        // Seed degli status dalla RPC (è la fonte di verità): evita la vecchia
        // query per-store `fetchStoreStatus` su ogni pin. StorePopup legge poi
        // `storeStatuses[id] || store.status`, gli update passano da storeStatuses.
        if (storesList.length > 0) {
          setStoreStatuses((prev) => {
            const next = { ...prev };
            for (const s of storesList) {
              if (next[s.id] === undefined) next[s.id] = s.status;
            }
            return next;
          });
        }

        // --- Log + modificatori in BATCH (niente più N+1) --------------------
        // Una sola query per TUTTI i log degli store caricati, poi una sola query
        // per i nomi dei modificatori. Sostituisce le 2·N query precedenti (un
        // round-trip log + un round-trip utente per ogni singolo pin): così il
        // costo è costante anche alzando il numero di pin caricati.
        // Solo gli store NON 'free' possono avere un modificatore da mostrare:
        // limitiamo la query batch a quegli id (tiene corta la querystring anche
        // con il cap alto del filtro cliente, ed evita lavoro inutile).
        const nonFreeIds = storesList
          .filter((s) => s.status !== 'free')
          .map((s) => s.id);
        const logsByStore: Record<number, { modifier: string; created_at: string }[]> = {};
        if (nonFreeIds.length > 0) {
          const { data: allLogs } = await supabase
            .from('store_status_logs')
            .select('store_id, modifier, created_at')
            .in('store_id', nonFreeIds)
            .order('created_at', { ascending: false });
          for (const log of allLogs ?? []) {
            (logsByStore[log.store_id] ||= []).push(log);
          }
        }

        // --- Esiti manage_form in BATCH -------------------------------------
        // Una sola query per gli esiti dei pin appena caricati. Serve a dare al
        // pin il colore del BUCKET giusto: con `lock_pin` (AiCall) lo status
        // grezzo è sempre `in_progress`, l'informazione vera è l'esito.
        // Scala col numero di pin A SCHERMO (≤ CLIENT_LIMIT), non col totale dei
        // negozi: stesso identico pattern della query dei log qui sopra, e come
        // quella è limitata ai soli store NON 'free' (un pin libero non ha esiti).
        if (nonFreeIds.length > 0) {
          const { data: allOutcomes } = await supabase
            .from('store_visit_outcomes')
            .select('store_id, outcome_data, created_at')
            .in('store_id', nonFreeIds)
            .order('created_at', { ascending: false });
          if (allOutcomes && allOutcomes.length > 0) {
            const esitoByStore: Record<number, string | null> = {};
            for (const o of allOutcomes) {
              // Righe già ordinate desc: la prima vista per uno store è la più recente.
              const sid = o.store_id as number;
              if (sid in esitoByStore) continue;
              const e = (o.outcome_data as any)?.esito;
              esitoByStore[sid] = typeof e === 'string' && e ? e : null;
            }
            setStoreEsiti((prev) => ({ ...prev, ...esitoByStore }));
          }
        }

        // Per ogni store modificato da altri, individua l'id del modificatore.
        const modifierIdByStore: Record<number, string> = {};
        const modifierIds = new Set<string>();
        for (const store of storesList) {
          if (store.status === 'free') continue;
          const otherLog = (logsByStore[store.id] ?? []).find(
            (l) => l.modifier !== user.id
          );
          if (otherLog) {
            modifierIdByStore[store.id] = otherLog.modifier;
            modifierIds.add(otherLog.modifier);
          }
        }

        // Una sola query per i nomi dei modificatori.
        const modifierNameById: Record<string, string> = {};
        if (modifierIds.size > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, surname')
            .in('id', Array.from(modifierIds));
          for (const u of usersData ?? []) {
            modifierNameById[u.id] = `${u.name} ${u.surname}`;
          }
        }

        const storesWithLogs = storesList.map((store) => {
          const modifierId = modifierIdByStore[store.id];
          return {
            ...store,
            modifiedByOtherUser: modifierId != null,
            modifierName: modifierId ? modifierNameById[modifierId] ?? '' : '',
            modifierId,
          };
        });

        // Anti-race: se nel frattempo è partita una fetch più recente, scarta
        // questo risultato (non sovrascrivere i pin con dati ormai superati).
        if (seq !== fetchSeqRef.current) return storesWithLogs;

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

        // Restituisce la lista caricata: l'effetto sul cambio filtro la usa per
        // calcolare i bounds lato client (fit-bounds) senza una query dedicata.
        return storesWithLogs;
      } finally {
        setIsLoadingStores(false);
      }
    },
    [supabase, user.id, viewportRadiusMeters] // selectedClientIds RIMOSSO: si legge dal ref → la callback non si ricrea al cambio filtro
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

  // Al cambio del filtro cliente (multi-select):
  //  - con uno o più clienti selezionati: carica TUTTI i loro pin (raggio
  //    massimo dal centro Italia), poi calcola l'estensione lato client e fa il
  //    dezoom automatico (fit-bounds) su tutta la distribuzione — per QUALSIASI
  //    cliente (AiCall, Scalapay, Amex…);
  //  - filtro rimosso ("Tutti"): ricarica in place al centro corrente (vista
  //    libera, raggio moderato), senza spostare la mappa.
  // NB: il fetch è esplicito (non dipende dal `moveend` post-flyToBounds, non
  // garantito su mappe mosse via codice) e usa solo `p_client_id` → robusto.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const ids = Array.from(selectedClientIds);
      if (ids.length === 0) {
        // Filtro rimosso: ricarica in place al centro corrente.
        const c = lastFetchCenter.current;
        if (c) {
          lastFetchCenter.current = null; // forza il refetch (bypassa il dedup)
          fetchStoresAndLogs(c[0], c[1]);
        }
        return;
      }

      // Carica i pin dei clienti selezionati su tutta Italia (raggio massimo dal
      // baricentro nazionale), così l'insieme è completo a prescindere da dove
      // sia la mappa adesso.
      lastFetchCenter.current = null;
      const loaded = await fetchStoresAndLogs(42.0, 12.5, CLIENT_MAX_RADIUS_M);
      if (cancelled || !loaded || loaded.length === 0) return;

      // Bounds lato client dai pin caricati → fit-bounds.
      let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
      for (const s of loaded) {
        const c = parseCoords((s as Store).location);
        if (!c) continue;
        if (c[0] < minLat) minLat = c[0];
        if (c[0] > maxLat) maxLat = c[0];
        if (c[1] < minLng) minLng = c[1];
        if (c[1] > maxLng) maxLng = c[1];
      }
      if (!isFinite(minLat)) return;

      const map = mapRef.current;
      if (map) {
        map.closePopup();
        map.flyToBounds(
          [
            [minLat, minLng],
            [maxLat, maxLng],
          ],
          { padding: [60, 60], duration: 0.8, maxZoom: 16 }
        );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedClientIds, fetchStoresAndLogs]);

  // Se il filtro Tier non è più applicabile (Scalapay non selezionato), azzera
  // la selezione tier: altrimenti resterebbe attiva nascondendo i pin degli
  // altri clienti (che non hanno tier).
  useEffect(() => {
    if (!showTierFilter && selectedTiers.size > 0) {
      setSelectedTiers(new Set());
    }
  }, [showTierFilter, selectedTiers]);

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

  // Persistenza filtri (clienti + tier + colori tier) in localStorage: la
  // selezione sopravvive a reload/navigazioni.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('appoint.mapFilters');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.clientIds)) setSelectedClientIds(new Set(parsed.clientIds));
        if (Array.isArray(parsed.tiers)) setSelectedTiers(new Set(parsed.tiers));
        if (typeof parsed.showTierColors === 'boolean') setShowTierColors(parsed.showTierColors);
      }
    } catch {
      /* localStorage non disponibile o JSON corrotto: si parte coi default */
    }
    filtersLoadedRef.current = true;
  }, []);

  // Un cliente può uscire dall'elenco selezionabile (clients.show_on_map = false).
  // La selezione persistita in localStorage però può contenerlo ancora: senza
  // questa potatura resterebbe un filtro ATTIVO su un cliente che non ha più la
  // sua chip → mappa vuota e nessun modo di deselezionarlo dalla UI.
  // Gira solo a lista clienti caricata (altrimenti azzererebbe la selezione al
  // primo render) e restituisce `prev` quando non c'è nulla da togliere, così
  // non innesca un refetch inutile.
  useEffect(() => {
    if (clients.length === 0) return;
    if (!filtersLoadedRef.current) return;
    setSelectedClientIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(clients.map((c) => c.id));
      const next = new Set<number>();
      let changed = false;
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [clients]);

  useEffect(() => {
    if (!filtersLoadedRef.current) return; // non salvare prima di aver caricato
    try {
      window.localStorage.setItem(
        'appoint.mapFilters',
        JSON.stringify({
          clientIds: Array.from(selectedClientIds),
          tiers: Array.from(selectedTiers),
          showTierColors,
        })
      );
    } catch {
      /* quota piena o storage disabilitato: ignora */
    }
  }, [selectedClientIds, selectedTiers, showTierColors]);

  // Numero di pin effettivamente mostrati (dopo il filtro tier), per il badge.
  const visibleStoresCount = useMemo(
    () =>
      stores.filter(
        (s) =>
          selectedTiers.size === 0 ||
          (s.tier != null && selectedTiers.has(s.tier))
      ).length,
    [stores, selectedTiers]
  );

  const handleSendEmail = useCallback((store: Store) => {
    setLoadingEmail(true); // Start loading for email

    const mailBody = generateMailBody(store, agent);

    const mailto = `mailto:${store.email}?subject=Proposta commerciale&body=${encodeURIComponent(mailBody)}`;
    window.location.href = mailto; // Open the default email client with the personalized email

    setTimeout(() => {
      setLoadingEmail(false); // Reset loading state after a short delay
    }, 3000); // This simulates the time taken to send the email
  }, [agent]);

  // Quando l'utente seleziona un risultato in AddressSearchBar, atterriamo lì
  // e triggeriamo un fetch esplicito: l'evento `moveend` di Leaflet su un
  // `setView` programmatico non è garantito (timing race con il commit React),
  // quindi non possiamo affidarci solo a quello. Eventuale doppio fetch da
  // moveend è idempotente grazie alla dedup in `fetchStoresAndLogs`.
  const handleAddressSelect = useCallback(
    (lat: number, lng: number) => {
      setSelectedLocation([lat, lng]);
      fetchStoresAndLogs(lat, lng);
    },
    [fetchStoresAndLogs]
  );

  // Apertura popup: il `panTo` che centra il pin genera un `moveend` e quindi una
  // fetch completa dei pin (costosa). Ma i dati non sono cambiati: stiamo solo
  // ricentrando la vista su un pin GIÀ caricato. Questo flag fa ignorare il
  // prossimo moveend, risparmiando una RPC da ~3,5 s per ogni scheda aperta.
  const skipNextMoveFetchRef = useRef(false);
  const handleMapMove = useCallback(
    (lat: number, lng: number) => {
      if (skipNextMoveFetchRef.current) {
        skipNextMoveFetchRef.current = false;
        return;
      }
      fetchStoresAndLogs(lat, lng);
    },
    [fetchStoresAndLogs]
  );

  // ── Deep-link "apri lead" (dalla Dashboard) ────────────────────────────────
  // `/protected?store=<id>&manage=1`: la mappa vola sul pin, ne apre il popup e
  // (con manage=1) apre direttamente il pannello "Gestisci". Riusa StorePopup
  // così com'è: nessuna scheda lead duplicata in Dashboard.
  const [deepLinkStoreId, setDeepLinkStoreId] = useState<number | null>(null);
  const [deepLinkManage, setDeepLinkManage] = useState(false);
  // Ref ai marker, per poter aprire il popup via codice.
  const markerRefs = useRef<Record<number, L.Marker | null>>({});
  const deepLinkOpenedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('store');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    setDeepLinkStoreId(id);
    setDeepLinkManage(params.get('manage') === '1');

    // Pulisce la query string: un refresh non deve riaprire la scheda.
    const url = new URL(window.location.href);
    url.searchParams.delete('store');
    url.searchParams.delete('manage');
    window.history.replaceState({}, '', url.pathname + url.search);

    // Coordinate del pin: una singola select per id (la RLS di `stores` si
    // applica → se l'utente non può vederlo, non si sposta nulla). Poi si
    // riusa il normale caricamento pin attorno a quel punto.
    (async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, location')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        console.error('Deep-link: punto vendita non trovato o non visibile', error);
        return;
      }
      const c = parseCoords((data as any).location);
      if (!c) return;
      setSelectedLocation([c[0], c[1]]);
      fetchStoresAndLogs(c[0], c[1]);
    })();
  }, [supabase, fetchStoresAndLogs]);

  // Quando il pin del deep-link è finalmente tra quelli caricati, apriamo il suo
  // popup. Una volta sola: dopo, l'utente resta libero di navigare.
  useEffect(() => {
    if (deepLinkStoreId == null || deepLinkOpenedRef.current) return;
    if (!stores.some((s) => s.id === deepLinkStoreId)) return;
    const marker = markerRefs.current[deepLinkStoreId];
    if (!marker) return;
    deepLinkOpenedRef.current = true;
    // Piccolo ritardo: lascia concludere il flyTo di MapController (che chiude i
    // popup all'inizio dell'animazione) prima di aprire il nostro.
    const t = setTimeout(() => marker.openPopup(), 850);
    return () => clearTimeout(t);
  }, [stores, deepLinkStoreId]);

  // Memo del cluster + markers: ad ogni rerender di Map che non cambia queste
  // deps (es. moveend che setta isAwayFromUser allo stesso valore, o qualsiasi
  // rerender "innocuo"), restituiamo la STESSA reference JSX → React skippa il
  // diff sul sub-tree → react-leaflet-cluster non distrugge/ricostruisce i
  // marker → il popup eventualmente aperto NON viene rimontato → niente flicker.
  const clusterLayer = useMemo(() => (
    <MarkerClusterGroup
      iconCreateFunction={createClusterIcon}
      maxClusterRadius={60}
      spiderfyOnMaxZoom
      showCoverageOnHover={false}
      zoomToBoundsOnClick
      disableClusteringAtZoom={16}
      minimumClusterSize={10}
      removeOutsideVisibleBounds={false}
      animate={false}
    >
      {stores
        .filter((store) =>
          selectedTiers.size === 0 ||
          (store.tier != null && selectedTiers.has(store.tier))
        )
        .map((store) => {
        const storeCoordinates = parseCoords(store.location);
        if (!storeCoordinates) return null;

        // Status EFFETTIVO del pin: parte dallo status locale più aggiornato
        // (`storeStatuses`, che riflette le modifiche già fatte in questa
        // sessione) e, se il negozio ha un esito manage_form, lascia vincere il
        // bucket dell'esito. È la STESSA funzione usata dalle card della
        // Dashboard → mappa e dashboard non possono più divergere.
        // Prima si leggeva `store.status` grezzo: per i clienti con `lock_pin`
        // (AiCall) restava `in_progress` per sempre e il pin non cambiava mai
        // colore al ri-esito.
        const effStatus = effectiveStoreStatus(
          storeStatuses[store.id] ?? store.status,
          storeEsiti[store.id]
        );

        const clientLogoUrl =
          effStatus === 'free' ? getClientLogoUrl(store.client_logo) : null;

        const tierFillColor = (showTierColors && store.tier)
          ? (TIER_COLORS[(store.tier as string).toLowerCase() as keyof typeof TIER_COLORS] ?? null)
          : null;

        const icon = store.modifiedByOtherUser
          ? effStatus === 'free'
            ? tierFillColor && clientLogoUrl
              ? createFreePinColoredWithLogo(tierFillColor, clientLogoUrl, true)
              : tierFillColor
                ? createFreePinColored(tierFillColor, true)
                : clientLogoUrl
                  ? createFreePinMutedWithLogo(clientLogoUrl)
                  : freePinM
            : effStatus === 'in_progress'
              ? progressPinM
              : effStatus === 'concluded'
                ? closedPinM
                : effStatus === 'already_client'
                  ? alreadyClientPinM
                  : effStatus === 'not_interested'
                    ? notInterestedPinM
                    : effStatus === 'non_existent'
                      ? nonExistentPinM
                      : failedPinM
          : effStatus === 'free'
            ? tierFillColor && clientLogoUrl
              ? createFreePinColoredWithLogo(tierFillColor, clientLogoUrl)
              : tierFillColor
                ? createFreePinColored(tierFillColor)
                : clientLogoUrl
                  ? createFreePinWithLogo(clientLogoUrl)
                  : freePin
            : effStatus === 'in_progress'
              ? progressPin
              : effStatus === 'concluded'
                ? closedPin
                : effStatus === 'already_client'
                  ? alreadyClientPin
                  : effStatus === 'not_interested'
                    ? notInterestedPin
                    : effStatus === 'non_existent'
                      ? nonExistentPin
                      : failedPin;

        const finalIcon = icon;

        return store.modifiedByOtherUser ? (
          <Marker
            key={store.id}
            position={storeCoordinates}
            icon={finalIcon}
            eventHandlers={{
              popupopen: () => {
                const map = mapRef.current;
                if (!map) return;
                // Il panTo qui sotto non deve innescare un ricaricamento pin.
                skipNextMoveFetchRef.current = true;
                // Il popup si estende verso l'alto dal marker. Centriamo la
                // mappa SOPRA il marker (~25% dell'altezza visibile) così il
                // pin risulta nella parte centro-bassa e il popup ha aria.
                const targetLatLng = L.latLng(storeCoordinates[0], storeCoordinates[1]);
                const z = map.getZoom();
                const targetPoint = map.project(targetLatLng, z);
                const verticalOffset = map.getSize().y * 0.25;
                const newCenter = map.unproject(
                  [targetPoint.x, targetPoint.y - verticalOffset],
                  z
                );
                map.panTo(newCenter, { animate: true, duration: 0.4 });
              },
            }}
          >
            <Popup autoPan={false}>
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
          <Marker
            key={store.id}
            position={storeCoordinates}
            icon={finalIcon}
            ref={(m) => {
              markerRefs.current[store.id] = m;
            }}
            eventHandlers={{
              popupopen: () => {
                const map = mapRef.current;
                if (!map) return;
                // Il panTo qui sotto non deve innescare un ricaricamento pin.
                skipNextMoveFetchRef.current = true;
                const targetLatLng = L.latLng(storeCoordinates[0], storeCoordinates[1]);
                const z = map.getZoom();
                const targetPoint = map.project(targetLatLng, z);
                const verticalOffset = map.getSize().y * 0.25;
                const newCenter = map.unproject(
                  [targetPoint.x, targetPoint.y - verticalOffset],
                  z
                );
                map.panTo(newCenter, { animate: true, duration: 0.4 });
              },
            }}
          >
            <Popup autoPan={false}>
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
                onEsitoLock={applyEsitoLock}
                onOutcomeSaved={handleOutcomeSaved}
                autoOpenManage={deepLinkManage && deepLinkStoreId === store.id}
              />
            </Popup>
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  ), [
    stores,
    selectedTiers,
    showTierColors,
    governanceLevel,
    modifierShowNameSet,
    statusLogs,
    loadingStatus,
    loadingEmail,
    storeStatuses,
    storeEsiti,
    fetchStatusLogs,
    handleStatusChangeAttempt,
    handleSendEmail,
    applyEsitoLock,
    handleOutcomeSaved,
    deepLinkManage,
    deepLinkStoreId,
  ]);

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
            {/* Address search isolata: rerenda solo se stessa, non l'intera mappa */}
            <AddressSearchBar onSelect={handleAddressSelect} />

            {/* Filter button + panel */}
            <div className='relative' ref={filtersPanelRef}>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='rounded-full text-xs flex items-center gap-1.5 shadow-md'
                style={{
                  backgroundColor: (selectedClientIds.size > 0 || selectedTiers.size > 0) ? '#224677' : 'white',
                  borderColor: '#224677',
                  color: (selectedClientIds.size > 0 || selectedTiers.size > 0) ? 'white' : '#224677',
                }}
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter className='h-3 w-3' />
                Filtri
                {(selectedClientIds.size > 0 || selectedTiers.size > 0) && (
                  <span className='bg-white text-[#224677] rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold'>
                    {selectedClientIds.size + selectedTiers.size}
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

                  {/* Cliente (multi-select: uno, più o tutti) */}
                  <p className='text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2'>Cliente</p>
                  <div className='flex flex-wrap gap-1.5 mb-4'>
                    <button
                      className='rounded-full text-xs px-3 py-1 border transition-colors'
                      style={{
                        backgroundColor: selectedClientIds.size === 0 ? '#224677' : 'white',
                        borderColor: '#224677',
                        color: selectedClientIds.size === 0 ? 'white' : '#224677',
                      }}
                      onClick={() => setSelectedClientIds(new Set())}
                    >
                      Tutti
                    </button>
                    {clients.map((c) => {
                      const logoUrl = getClientLogoUrl(c.logo);
                      const isActive = selectedClientIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          className='rounded-full text-xs px-3 py-1 border flex items-center gap-1.5 transition-colors'
                          style={{
                            backgroundColor: isActive ? '#224677' : 'white',
                            borderColor: '#224677',
                            color: isActive ? 'white' : '#224677',
                          }}
                          onClick={() =>
                            setSelectedClientIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
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

                  {/* Tier — solo per Scalapay (gli altri clienti non hanno tier) */}
                  {showTierFilter && (
                  <>
                  <p className='text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2'>Tier Scalapay</p>
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
                  </>
                  )}

                  {/* Reset */}
                  {(selectedClientIds.size > 0 || selectedTiers.size > 0) && (
                    <button
                      className='mt-3 w-full text-xs text-gray-400 hover:text-gray-600 underline'
                      onClick={() => { setSelectedClientIds(new Set()); setSelectedTiers(new Set()); }}
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
            className='pointer-events-none absolute left-1/2 bottom-6 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm text-gray-700 shadow-lg backdrop-blur-sm'
            role='status'
            aria-live='polite'
          >
            <Loader className='h-4 w-4 animate-spin' style={{ color: '#224677' }} />
            <span>Caricamento punti vendita…</span>
          </div>
        )}

        {/* Contatore pin caricati: visibile quando non stiamo caricando e ci
            sono pin. Con un filtro cliente attivo evidenzia quanti se ne vedono. */}
        {!isLoadingStores && visibleStoresCount > 0 && (
          <div
            className='pointer-events-none absolute left-1/2 bottom-6 z-[1000] -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-gray-700 shadow-lg backdrop-blur-sm'
            role='status'
            aria-live='polite'
          >
            {visibleStoresCount} {visibleStoresCount === 1 ? 'punto vendita' : 'punti vendita'}
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
            <MapController newCenter={selectedLocation} />
            <MapEventHandler onMapMove={handleMapMove} />
            {Array.isArray(coord) && (
              <UserLocationTracker
                userCoord={coord as [number, number]}
                onVisibilityChange={setIsAwayFromUser}
              />
            )}
            {/* Tile delle strade. Ottimizzazioni di caricamento:
                - subdomains a–d → fino a 4 host paralleli (più download in parallelo);
                - updateWhenIdle={false} → carica i tile DURANTE il pan, non solo a fine gesto;
                - updateWhenZooming={false} → niente fetch intermedi mentre si zooma (meno richieste sprecate);
                - keepBuffer={4} → tiene in cache una corona di tile attorno al viewport
                  (pan brevi non riscaricano nulla → mappa "istantanea"). */}
            <TileLayer
              url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
              subdomains={['a', 'b', 'c', 'd']}
              updateWhenIdle={false}
              updateWhenZooming={false}
              keepBuffer={4}
              maxZoom={20}
            />
            <ZoomControl position='bottomright' />

            {/* Marker for the user's current location */}
            <Marker icon={navIcon} position={coord}>
              <Popup>
                Ciao {agent?.name}, utilizza la mappa per trovare le opportunità
                di vendita più vicine a te.
              </Popup>
            </Marker>

            {/* Cluster + individual markers (memoizzato per evitare flicker dei popup
                durante pan/zoom della mappa) */}
            {clusterLayer}
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
