'use client';

// TODO: METTI MODULO CONFERMA DOPO CAMBIO STATO, fetch stores quando cambi con cursore

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

import { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import {
  navIcon,
  getMyLoc,
  parseCoords,
  freeStoreIcon,
  inProgressStoreIcon,
  concludedStoreIcon,
  failedStoreIcon,
} from '@/utils/navigation';
import {
  Phone,
  Navigation,
  Settings,
  MailPlus,
  Loader,
  FileCheck,
} from 'lucide-react';
import { Button } from './ui/button';
import Image from 'next/image';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { SelectComponent } from './select';
import { statuses } from '@/utils/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

interface Store {
  id: number;
  name: string;
  address: string;
  location: string; // PostGIS 'location' (geography) field
  phone: string;
  category: string;
  email: string;
  owner_name: string;
  status: 'free' | 'in_progress' | 'concluded' | 'failed';
}

interface Agent {
  name: string;
  surname: string;
  number: string;
}

interface StoreLog {
  id: number;
  prev: string;
  new: string;
  created_at: string;
  modifier: number;
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

  const handleStatusChangeAttempt = (storeId: number, newStatus: string) => {
    setSelectedStoreId(storeId);
    setSelectedStatus(newStatus);
    setDialogOpen(true);
  };

  const confirmStatusChange = async () => {
    if (selectedStoreId && selectedStatus) {
      await updateStoreStatus(selectedStoreId, selectedStatus);
      setDialogOpen(false); // Close dialog after confirmation
    }
  };

  // Fetch the status for a specific store from the DB
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

  // Update store status and refetch the status from the database
  const updateStoreStatus = async (storeId: number, newStatus: string) => {
    // Find the label corresponding to the newStatus value
    const newStatusLabel =
      statuses.find((status) => status.value === newStatus)?.label || newStatus;

    // Prompt the user for confirmation with the label instead of the value
    const confirmChange = window.confirm(
      `Sei sicuro di voler cambiare lo stato in "${newStatusLabel}"?`
    );

    // If user cancels, stop the function here
    if (!confirmChange) {
      return;
    }

    const previousStatus = storeStatuses[storeId] || 'free';
    setLoadingStatus((prev) => ({ ...prev, [storeId]: true }));

    try {
      const { error: updateError } = await supabase
        .from('stores')
        .update({ status: newStatus })
        .eq('id', storeId);

      if (updateError) {
        console.error('Error updating store status:', updateError);
        return;
      }

      const { error: logError } = await supabase
        .from('store_status_logs')
        .insert([
          {
            store_id: storeId,
            prev: previousStatus,
            new: newStatus,
            modifier: user.id,
          },
        ]);

      if (logError) {
        console.error('Error logging status change:', logError);
      } else {
        await fetchStoreStatus(storeId);
        await fetchStatusLogs(storeId);
      }
    } catch (error) {
      console.error('Unexpected error while updating status:', error);
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

    // Fetch stores within 3km of user's location
    const getStoresWithinRadius = async (userLat: number, userLng: number) => {
      const { data: storeData, error } = await supabase.rpc(
        'get_stores_within_radius',
        {
          lat: userLat,
          lng: userLng,
          radius: 3000, // 3 km radius
        }
      );

      if (error) {
        console.error('Error fetching stores:', error);
      } else {
        setStores(storeData || []);
      }
    };

    // Get user's current location and fetch nearby stores
    getMyLoc((coords: LatLngExpression | null) => {
      if (coords) {
        setCoord(coords);
        if (Array.isArray(coords)) {
          getStoresWithinRadius(coords[0], coords[1]);
        }
      }
    });

    getUserName();
  }, [user.id, supabase]);

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

    // Personalized email content with store owner and user information
    const mailBody = `Gentile Sig/Sig.ra ${store.owner_name},\n\nsono ${agent?.name} ${agent?.surname}, consulente dell'agenzia Attitude, società mandataria di Scalapay spa, iscritto nell'elenco dell'Organismo per la gestione degli agenti in attività Finanziaria con il numero di iscrizione SP2423 (www.organismo-am.it/elenchi-registri/index.html).\n\nIn allegato troverà tutti i dettagli in merito alle soluzioni di pagamento e ai servizi offerti da Scalapay che le ho illustrato durante il nostro incontro.\n\nNel caso di suo interesse a procedere con la sottoscrizione, non esiti a rispondere a questa mail o a contattarmi al numero che troverà in firma.\n\nCordiali saluti,\n${agent?.name} ${agent?.surname}\n${agent?.number}`;

    const mailto = `mailto:${store.email}?subject=Proposta commerciale&body=${encodeURIComponent(mailBody)}`;
    window.location.href = mailto; // Open the default email client with the personalized email

    setTimeout(() => {
      setLoadingEmail(false); // Reset loading state after a short delay
    }, 2000); // This simulates the time taken to send the email
  };

  return (
    <>
      {coord ? (
        <MapContainer
          style={{
            height: '80vh',
            width: '100vw',
          }}
          center={coord}
          zoom={16}
          scrollWheelZoom={true}
        >
          <TileLayer url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' />

          {/* Marker for the user's current location */}
          <Marker icon={navIcon} position={coord}>
            <Popup>
              Ciao {agent?.name}, oggi ti mancano 3 attività per raggiungere il
              tuo obiettivo.
            </Popup>
          </Marker>

          {/* Marker for each store within 3km */}
          {stores.map((store) => {
            // Parse the store's location field 'POINT(lng lat)' into actual coordinates
            const storeCoordinates = parseCoords(store.location);

            // Determine the correct icon based on the store's status
            let icon;
            const status = storeStatuses[store.id] || store.status;
            switch (status) {
              case 'free':
                icon = freeStoreIcon;
                break;
              case 'in_progress':
                icon = inProgressStoreIcon;
                break;
              case 'concluded':
                icon = concludedStoreIcon;
                break;
              case 'failed':
                icon = failedStoreIcon;
                break;
              default:
                icon = freeStoreIcon; // fallback to a default store icon
            }

            // Ensure storeCoordinates is not null before rendering the Marker
            return (
              storeCoordinates && (
                <Marker key={store.id} position={storeCoordinates} icon={icon}>
                  <Popup>
                    <div className='flex items-center'>
                      <Image
                        className='rounded-full shadow-md'
                        src='/store.jpeg'
                        alt='Store'
                        width={50}
                        height={50}
                      />
                      <div className='ml-3'>
                        <p className='leading-tight'>
                          <span className='text-lg font-semibold'>
                            {store.name}
                          </span>
                          <br />
                          <span className='text-base text-gray-400'>
                            {store.category}
                          </span>
                          <br />
                          <span className='text-sm text-gray-500'>
                            {store.address}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className='flex flex-col gap-2 mt-2'>
                      <Button
                        variant='secondary'
                        className='w-full bg-[#1B304E] hover:bg-[#224677]'
                        onClick={() => {
                          if (Array.isArray(coord) && coord.length === 2) {
                            const [lat, lng] = coord;
                            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
                            window.open(gmapsUrl, '_blank');
                          }
                        }}
                      >
                        <Navigation className='mr-2' /> Indicazioni
                      </Button>

                      <Button
                        variant='secondary'
                        className='w-full bg-[#1B304E] hover:bg-[#224677]'
                        onClick={() => {
                          window.open(`tel:${store.phone}`, '_self');
                        }}
                      >
                        <Phone className='mr-2' /> Chiama
                      </Button>

                      <Sheet>
                        <SheetTrigger onClick={() => fetchStatusLogs(store.id)}>
                          <Button
                            variant='secondary'
                            className='w-full bg-[#1B304E] hover:bg-[#224677]'
                          >
                            <Settings className='mr-2' /> Gestisci
                          </Button>
                        </SheetTrigger>
                        <SheetContent className='z-1000 flex flex-col h-screen overflow-y-auto p-4'>
                          <SheetHeader>
                            <SheetTitle className='text-xl font-bold'>
                              Info punto vendita
                            </SheetTitle>
                            <SheetDescription>
                              Qui trovi i dettagli dell'attività.
                            </SheetDescription>
                          </SheetHeader>

                          <div className='py-4'>
                            <div className='py-3 border-b border-gray-200'>
                              <strong className='text-lg font-semibold'>
                                {store.name}
                              </strong>
                            </div>

                            <div className='py-3 border-b border-gray-200'>
                              <p className='text-base text-gray-400 font-medium'>
                                Categoria:
                              </p>
                              <p className='text-base text-gray-600'>
                                {store.category}
                              </p>
                            </div>

                            <div className='py-3'>
                              <p className='text-base text-gray-400 font-medium'>
                                Indirizzo:
                              </p>
                              <p className='text-base text-gray-600'>
                                {store.address}
                              </p>
                            </div>
                          </div>

                          <div className='flex flex-col gap-2 mb-2'>
                            <SelectComponent
                              placeholder='Stato avanzamento'
                              value={status}
                              onChange={(newStatus) => {
                                if (newStatus)
                                  updateStoreStatus(store.id, newStatus);
                              }}
                              options={statuses}
                              disabled={loadingStatus[store.id]} // Disable during status update
                            />
                          </div>

                          <AlertDialog>
                            <AlertDialogTrigger>Open</AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Are you absolutely sure?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will
                                  permanently delete your account and remove
                                  your data from our servers.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction>Continue</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {status === 'in_progress' && (
                            <Button
                              disabled={loadingEmail}
                              className='w-full'
                              onClick={() => {
                                handleSendEmail(store);
                              }}
                            >
                              {loadingEmail ? (
                                'Invio...'
                              ) : (
                                <>
                                  <MailPlus className='mr-2' /> Invia e-mail
                                </>
                              )}
                            </Button>
                          )}

                          {status === 'concluded' && (
                            <Button
                              onClick={() =>
                                window.open(
                                  'https://appraise.attitudeltd.com',
                                  '_blank'
                                )
                              }
                            >
                              <>
                                <FileCheck className='mr-2' /> Compila distinta
                              </>
                            </Button>
                          )}

                          {/* Conditionally render Storico if there are relevant logs */}
                          {statusLogs[store.id]?.length > 0 && (
                            <div className='py-3'>
                              <p className='text-lg font-medium text-gray-300 mb-3 border-b border-gray-600 pb-2'>
                                Storico Modifiche
                              </p>
                              {statusLogs[store.id].map((log) => {
                                const prevLabel =
                                  statuses.find(
                                    (status) => status.value === log.prev
                                  )?.label || log.prev;
                                const newLabel =
                                  statuses.find(
                                    (status) => status.value === log.new
                                  )?.label || log.new;

                                return (
                                  <div
                                    key={log.id}
                                    className='mb-3 p-3 bg-gray-800 rounded-lg shadow-md border border-gray-700'
                                  >
                                    <p className='text-sm text-gray-400 mb-1'>
                                      <strong>Data:</strong>{' '}
                                      {new Date(
                                        log.created_at
                                      ).toLocaleString()}
                                    </p>
                                    <p className='text-sm text-gray-400 mb-1'>
                                      <strong>Stato Precedente:</strong>{' '}
                                      <span className='text-gray-200'>
                                        {prevLabel}
                                      </span>
                                    </p>
                                    <p className='text-sm text-gray-400'>
                                      <strong>Nuovo Stato:</strong>{' '}
                                      <span className='text-gray-200'>
                                        {newLabel}
                                      </span>
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <SheetFooter className='mt-auto'>
                            <SheetClose>
                              <Button type='button' className='w-full'>
                                Chiudi
                              </Button>
                            </SheetClose>
                          </SheetFooter>
                        </SheetContent>
                      </Sheet>
                    </div>
                  </Popup>
                </Marker>
              )
            );
          })}
        </MapContainer>
      ) : (
        <p className='m-20'>Caricamento...</p>
      )}
    </>
  );
};

export default Map;
