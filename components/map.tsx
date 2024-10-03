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
} from '@/utils/navigation'; // Import mapPinMinusIcon
import { Button } from './ui/button';
import Image from 'next/image';

interface Store {
  id: number;
  name: string;
  address: string;
  location: string; // PostGIS 'location' (geography) field
}

const Map = ({ user }: any) => {
  const supabase = createClient();
  const [userName, setUserName] = useState<string | null>(null);
  const [coord, setCoord] = useState<LatLngExpression | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [bookedStores, setBookedStores] = useState<number[]>([]); // Track booked stores

  useEffect(() => {
    // Fetch user's name
    const getUserName = async () => {
      const { data: userName, error } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user name:', error);
      } else {
        setUserName(userName?.name || null);
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
          <TileLayer
            url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
            attribution='&copy; <a href="https://carto.com/">CartoDB</a> contributors'
          />

          {/* Marker for the user's current location */}
          <Marker icon={navIcon} position={coord}>
            <Popup>
              Ciao {userName}, oggi ti mancano 3 attività per raggiungere il tuo
              obiettivo.
            </Popup>
          </Marker>

          {/* Markers for each store within 3km */}
          {stores.map((store) => {
            // Parse the store's location field 'POINT(lng lat)' into actual coordinates
            const storeCoordinates = parseCoords(store.location);

            if (storeCoordinates) {
              // Determine if the store is booked or not
              const icon = bookedStores.includes(store.id)
                ? mapPinMinusIcon
                : storeIcon;

              return (
                <Marker
                  key={store.id}
                  position={storeCoordinates} // This will now be a [lat, lng] tuple
                  icon={icon}
                >
                  <Popup>
                    <div className='flex pr-3 items-start'>
                      <Image
                        className='mr-2 -ml-2 rounded-full'
                        src='/store.jpeg'
                        alt='Store'
                        width={50}
                        height={50}
                      />
                      <div>
                        <strong>{store.name}</strong> <br /> {store.address}
                        <div className='flex gap-2 my-1 scale-90'>
                          <div>
                            <Button
                              variant='secondary'
                              onClick={() => {
                                if (
                                  Array.isArray(coord) &&
                                  coord.length === 2
                                ) {
                                  const [lat, lng] = coord;
                                  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
                                  window.open(gmapsUrl, '_blank'); // Opens Google Maps in a new tab
                                } else {
                                  console.error('Invalid coordinates format');
                                }
                              }}
                            >
                              Portami lì
                            </Button>

                            <Button
                              variant='secondary'
                              // onClick={() => handleBookStore(store.id)}
                            >
                              Chiama
                            </Button>
                          </div>

                          <Button
                            variant='secondary'
                            onClick={() => handleBookStore(store.id)}
                          >
                            Gestisci
                            {/* Contatto iniziale (3 gg) */}
                            {/* Fissato appuntamento (10 gg) */}
                            {/* In trattativa (15 gg) */}
                            {/* Contratto sottoscritto */}
                            {/* Non interessato */}
                          </Button>
                        </div>
                      </div>
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
