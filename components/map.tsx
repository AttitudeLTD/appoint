'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { customNaviIcon, getMyLocation, parseCoors } from '@/utils/navigation';

interface Store {
  id: number;
  name: string;
  coordinates: string; // stored as string like "[45.4642, 9.1916]"
}

const Map = ({ user }: any) => {
  const supabase = createClient();

  const [userName, setUserName] = useState<string | null>(null);
  const [coord, setCoord] = useState<LatLngExpression | null>(null);
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    // Function to get the username of the current user
    const getUserName = async () => {
      const { data: userName } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single();

      setUserName(userName?.name || null);
    };

    // Function to get the stores from the database
    const getStores = async () => {
      const { data: storeData, error } = await supabase
        .from('stores')
        .select('id, name, coordinates');

      if (error) {
        console.error('Error fetching stores:', error);
      } else {
        setStores(storeData || []);
      }
    };

    // Fetch username and stores data
    getUserName();
    getStores();
    getMyLocation(setCoord);
  }, [user.id, supabase]);

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
          <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />

          {/* Marker for the user's current location */}
          <Marker icon={customNavigationIcon} position={coord}>
            <Popup>
              Ciao {userName}, oggi ti mancano 3 attività per raggiungere il tuo
              obiettivo.
            </Popup>
          </Marker>

          {/* Markers for each store */}
          {stores.map((store) => {
            const storeCoordinates = parseCoordinates(store.coordinates); // Parse coordinates from string to array

            if (storeCoordinates) {
              return (
                <Marker
                  key={store.id}
                  position={storeCoordinates}
                  icon={customNavigationIcon} // You can use a different icon if needed
                >
                  <Popup>{store.name}</Popup>
                </Marker>
              );
            }
            return null; // If the coordinates are invalid, skip rendering
          })}
        </MapContainer>
      ) : (
        <p>Loading map...</p>
      )}
    </>
  );
};

export default Map;
