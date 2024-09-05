'use client';

import { useEffect, useState } from 'react';

import L, { LatLngExpression } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const Map = () => {
  const [coord, setCoord] = useState<LatLngExpression | null>(null);

  useEffect(() => {
    const getMyLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
          setCoord([position.coords.latitude, position.coords.longitude]);
        });
      } else {
        console.log('Geolocation is not supported by this browser.');
      }
    };

    getMyLocation();
  }, []);

  // Function to convert an SVG element to a data URL
  const svgToDataUrl = (svgString: string) => {
    return `data:image/svg+xml;base64,${btoa(svgString)}`;
  };

  // Generate the SVG string for Navigation2 icon with a light blue fill
  const navigationSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="lightblue" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation-2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>`;

  // Convert the SVG string to a data URL
  const navigationIconUrl = svgToDataUrl(navigationSvgString);

  // Define your custom Leaflet icon using the SVG data URL
  const customNavigationIcon = new L.Icon({
    iconUrl: navigationIconUrl,
    iconRetinaUrl: navigationIconUrl,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
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
          <Marker icon={customNavigationIcon} position={coord}>
            <Popup>
              A pretty CSS3 popup. <br /> Easily customizable.
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
