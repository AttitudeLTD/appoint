import L, { LatLngExpression } from 'leaflet';
import MarkerShadow from '../node_modules/leaflet/dist/images/marker-shadow.png';

// Function to convert an SVG element to a data URL
export const svgToDataUrl = (svgString: string) => {
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
};

// Keep navigation icon the same as before
export const navigationSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="lightblue" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation-2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>`;
export const navigationIconUrl = svgToDataUrl(navigationSvgString);
export const navIcon = new L.Icon({
  iconUrl: navigationIconUrl,
  iconRetinaUrl: navigationIconUrl,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

// Generate the SVG string for MapPin icon from Lucide with a custom color fill
export const mapPinSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M12 21s-6-5.686-6-10A6 6 0 0 1 12 5a6 6 0 0 1 6 6c0 4.314-6 10-6 10z"></path><circle cx="12" cy="11" r="3"></circle></svg>`;

// Convert the SVG string to a data URL
export const mapPinIconUrl = svgToDataUrl(mapPinSvgString);

// Define your custom Leaflet store icon using the MapPin SVG data URL
export const storeIcon = new L.Icon({
  iconUrl: mapPinIconUrl,
  iconRetinaUrl: mapPinIconUrl,
  iconSize: [24, 24], // Adjust the size as needed
  iconAnchor: [12, 24], // Anchor it to the bottom of the icon
  popupAnchor: [0, -24], // Adjust popup position above the icon
  shadowUrl: MarkerShadow.src, // Keep the shadow for the marker
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
