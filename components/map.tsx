'use client';

import { useState } from 'react';

import L, { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import MarkerIcon from '../node_modules/leaflet/dist/images/marker-icon.png';
import MarkerShadow from '../node_modules/leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

const Map = () => {
  const [coord, setCoord] = useState<LatLngExpression | undefined>([
    41.90446927076292, 12.48775435635493,
  ]);

  const SearchLocation = () => {
    return (
      <div className='search-location'>
        <input type='text' placeholder='Search Location' />
      </div>
    );
  };

  const GetMyLocation = () => {
    const getMyLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
          setCoord([position.coords.latitude, position.coords.longitude]);
        });
      } else {
        console.log('Geolocation is not supported by this browser.');
      }
    };

    return (
      <div className='get-my-location'>
        <button onClick={getMyLocation}>Get My Location</button>
      </div>
    );
  };

  return (
    <>
      {/* <SearchLocation /> */}
      <GetMyLocation />

      <MapContainer
        style={{
          height: '80vh',
          width: '100vw',
        }}
        center={coord}
        zoom={13}
        scrollWheelZoom={true}
      >
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
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
        >
          <Popup>
            A pretty CSS3 popup. <br /> Easily customizable.
          </Popup>
        </Marker>
      </MapContainer>
    </>
  );
};

export default Map;
