'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

import { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import {
  navIcon,
  getMyLocation,
  parseCoords,
  storeIcon,
  haversineDistance,
} from '@/utils/navigation';

interface Store {
  id: number;
  name: string;
  coordinates: string;
}

const Map = ({ user }: any) => {
  const supabase = createClient();

  const [userName, setUserName] = useState<string | null>(null);
  const [coord, setCoord] = useState<LatLngExpression | null>(null);
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    // Function to get the username of the current user
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

    getUserName();
    getStores();
    getMyLocation(setCoord);
  }, [user.id, supabase]);

  // Filter stores within 3km radius
  const filteredStores = stores.filter((store) => {
    const storeCoordinates = parseCoords(store.coordinates);
    if (storeCoordinates && coord) {
      const distance = haversineDistance(
        coord as [number, number],
        storeCoordinates as [number, number]
      );
      return distance <= 3; // Only include stores within 3km
    }
    return false;
  });

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
          <Marker icon={navIcon} position={coord}>
            <Popup>
              Ciao {userName}, oggi ti mancano 3 attività per raggiungere il tuo
              obiettivo.
            </Popup>
          </Marker>

          {/* Markers for each store within 3km */}
          {filteredStores.map((store) => {
            const storeCoordinates = parseCoords(store.coordinates);
            if (storeCoordinates) {
              return (
                <Marker
                  key={store.id}
                  position={storeCoordinates}
                  icon={storeIcon}
                >
                  <Popup>{store.name}</Popup>
                </Marker>
              );
            }
            return null; // If coordinates are invalid, skip rendering
          })}
        </MapContainer>
      ) : (
        <p>Loading map...</p>
      )}
    </>
  );
};

export default Map;
