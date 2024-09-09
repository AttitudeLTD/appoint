import L, { LatLngExpression } from 'leaflet';
import MarkerIcon from '../node_modules/leaflet/dist/images/marker-icon.png';
import MarkerShadow from '../node_modules/leaflet/dist/images/marker-shadow.png';

// Function to convert an SVG element to a data URL
export const svgToDataUrl = (svgString: string) => {
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
};

// Generate the SVG string for Navigation2 icon with a light blue fill
export const navigationSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="lightblue" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation-2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>`;

// Convert the SVG string to a data URL
export const navigationIconUrl = svgToDataUrl(navigationSvgString);

// Define your custom Leaflet icon using the SVG data URL
export const navIcon = new L.Icon({
  iconUrl: navigationIconUrl,
  iconRetinaUrl: navigationIconUrl,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

export const storeIcon = new L.Icon({
  iconUrl: MarkerIcon.src,
  iconRetinaUrl: MarkerIcon.src,
  iconSize: [20, 36],
  iconAnchor: [12.5, 41],
  popupAnchor: [0, -41],
  shadowUrl: MarkerShadow.src,
  shadowSize: [41, 41],
});

// Define and export the getMyLocation function
export const getMyLocation = (
  callback: (coords: LatLngExpression | null) => void
): void => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        callback([position.coords.latitude, position.coords.longitude]);
      },
      () => {
        console.log(
          'Geolocation is not supported by this browser or access is denied.'
        );
        callback(null);
      }
    );
  } else {
    console.log('Geolocation is not supported by this browser.');
    callback(null);
  }
};

// Function to parse and validate coordinates from string to array
export const parseCoords = (coordinates: string): LatLngExpression | null => {
  try {
    const parsed = JSON.parse(coordinates); // Convert string to array
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [lat, lng] = parsed;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return [lat, lng] as LatLngExpression; // Return as valid LatLngExpression
      }
    }
  } catch (error) {
    console.error('Invalid coordinates:', coordinates);
  }
  return null; // Return null if the conversion fails
};

export const haversineDistance = (
  coords1: LatLngExpression,
  coords2: LatLngExpression
): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // Radius of the Earth in km

  const [lat1, lon1] = coords1 as [number, number];
  const [lat2, lon2] = coords2 as [number, number];

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in km
};
