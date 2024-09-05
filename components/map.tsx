'use client';

import L from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import MarkerIcon from '../node_modules/leaflet/dist/images/marker-icon.png';
import MarkerShadow from '../node_modules/leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

const Map = () => {
  return (
    <MapContainer
      style={{
        height: '100vh',
        width: '100vw',
      }}
      center={[51.505, -0.09]}
      zoom={13}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      />
      <Marker
        icon={
          new L.Icon({
            iconUrl: MarkerIcon.src,
            iconRetinaUrl: MarkerIcon.src,
            iconSize: [25, 41],
            iconAnchor: [12.5, 41],
            popupAnchor: [0, -41],
            shadowUrl: MarkerShadow.src,
            shadowSize: [41, 41],
          })
        }
        position={[51.505, -0.09]}
      ></Marker>
    </MapContainer>
  );
};

export default Map;
