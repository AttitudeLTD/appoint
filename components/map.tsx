'use client';

import { useEffect, useState } from 'react';

import { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { customNavigationIcon, getMyLocation } from '@/utils/navigation';

const Map = () => {
  const [coord, setCoord] = useState<LatLngExpression | null>(null);

  useEffect(() => {
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
              A pretty CSS3 popup! <br /> Easily customizable.
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
