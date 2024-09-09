'use client';

import { useEffect, useState } from 'react';

import { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { customNavigationIcon, getMyLocation } from '@/utils/navigation';
import { getUserName } from '@/utils/user';

const Map = () => {
  const [userName, setUserName] = useState<string | null>(null);
  const [coord, setCoord] = useState<LatLngExpression | null>(null);

  useEffect(() => {
    const fetchUserName = async () => {
      const name = await getUserName();
      setUserName(name);
    };

    fetchUserName();
    getMyLocation(setCoord);
  }, []);

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
          <Marker icon={customNavigationIcon} position={coord}>
            <Popup>
              Ciao {userName}, oggi ti mancano 3 attività per raggiungere il tuo
              obiettivo.
            </Popup>
          </Marker>
        </MapContainer>
      ) : (
        <p>Loading map...</p>
      )}
    </>
  );
};

export default Map;
