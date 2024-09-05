'use client';

import { MapContainer, TileLayer } from 'react-leaflet';

const Map = () => {
  return (
    <div>
      <MapContainer>
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
      </MapContainer>
    </div>
  );
};

export default Map;
