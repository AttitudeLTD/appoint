'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

import { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import {
  navIcon,
  getMyLoc,
  storeIcon,
  parseCoords,
  mapPinMinusIcon,
} from '@/utils/navigation';

import { Phone, Navigation, Settings, MailPlus } from 'lucide-react';
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

interface Store {
  id: number;
  name: string;
  address: string;
  location: string; // PostGIS 'location' (geography) field
  phone: string;
  category: string;
  email: string;
  owner_name: string;
}

interface Agent {
  name: string;
  surname: string;
  number: string;
}

const Map = ({ user }: any) => {
  const supabase = createClient();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [coord, setCoord] = useState<LatLngExpression | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [bookedStores, setBookedStores] = useState<number[]>([]); // Track booked stores

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

        // Assuming coords is a tuple [lat, lng]
        if (Array.isArray(coords)) {
          getStoresWithinRadius(coords[0], coords[1]); // Fetch stores when user location is available
        } else {
          console.error('Invalid coordinates format');
        }
      } else {
        console.error('Unable to fetch user location');
      }
    });

    getUserName();
  }, [user.id, supabase]);

  const handleBookStore = (storeId: number) => {
    setBookedStores((prev) => [...prev, storeId]);
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

            if (storeCoordinates) {
              // Determine if the store is booked or not
              const icon = bookedStores.includes(store.id)
                ? mapPinMinusIcon
                : storeIcon;

              return (
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
                        className='w-full'
                        onClick={() => {
                          if (Array.isArray(coord) && coord.length === 2) {
                            const [lat, lng] = coord;
                            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
                            window.open(gmapsUrl, '_blank'); // Opens Google Maps in a new tab
                          } else {
                            console.error('Invalid coordinates format');
                          }
                        }}
                      >
                        <Navigation className='mr-2' /> Indicazioni
                      </Button>

                      <Button
                        variant='secondary'
                        className='w-full'
                        onClick={() => {
                          window.open(`tel:${store.phone}`, '_self'); // Open tel: link in the same tab
                        }}
                      >
                        <Phone className='mr-2' /> Chiama
                      </Button>

                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant='secondary' className='w-full'>
                            <Settings className='mr-2' /> Gestisci
                          </Button>
                        </SheetTrigger>
                        <SheetContent className='z-1000'>
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
                          <Button
                            className='w-full mb-3'
                            onClick={() => {
                              // Personalized email content with store owner and user information
                              const mailBody = `Gentile Sig/Sig.ra ${store.owner_name},\n\nsono ${agent?.name} ${agent?.surname}, consulente dell'agenzia Attitude, società mandataria di Scalapay spa, iscritto nell'elenco dell'Organismo per la gestione degli agenti in attività Finanziaria con il numero di iscrizione SP2423 (www.organismo-am.it/elenchi-registri/index.html).\n\nIn allegato troverà tutti i dettagli in merito alle soluzioni di pagamento e ai servizi offerti da Scalapay che le ho illustrato durante il nostro incontro.\n\nNel caso di suo interesse a procedere con la sottoscrizione, non esiti a rispondere a questa mail o a contattarmi al numero che troverà in firma.\n\nCordiali saluti,\n${agent?.name} ${agent?.surname}\n${agent?.number}`;

                              const mailto = `mailto:${store.email}?subject=Proposta commerciale&body=${encodeURIComponent(mailBody)}`;
                              window.location.href = mailto; // Open the default email client with the personalized email
                            }}
                          >
                            <MailPlus className='mr-2' /> Invia e-mail
                          </Button>

                          <SheetFooter>
                            <SheetClose asChild>
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
              );
            } else {
              console.error(`Invalid coordinates for store: ${store.name}`);
              return null; // Skip rendering if coordinates are invalid
            }
          })}
        </MapContainer>
      ) : (
        <p>Loading map...</p>
      )}
    </>
  );
};

export default Map;
