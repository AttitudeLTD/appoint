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
export const getMyLoc = (
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

// Utility to parse 'POINT(lng lat)' into [lat, lng]
export const parseCoords = (coordinates: string): [number, number] | null => {
  const match = coordinates.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  if (match) {
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    // Ensure both lat and lng are valid numbers
    if (!isNaN(lat) && !isNaN(lng)) {
      return [lat, lng]; // Return valid [lat, lng] tuple
    }
  }
  return null; // Return null if parsing failed
};
