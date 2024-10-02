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

// Generate the SVG string for MapPinPlus icon with blue stroke
export const mapPinPlusSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="lightblue" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-plus-inside">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <path d="M36 21v18"/>
  <path d="M27 30h18"/>
</svg>`;

// Convert the SVG string to a data URL
export const mapPinPlusIconUrl = svgToDataUrl(mapPinPlusSvgString);

// Define your custom Leaflet store icon using the MapPinPlus SVG data URL
export const storeIcon = new L.Icon({
  iconUrl: mapPinPlusIconUrl,
  iconRetinaUrl: mapPinPlusIconUrl,
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

// Generate the SVG string for MapPinMinus icon with light orange fill and white stroke
export const mapPinMinusSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="lightorange" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-minus-inside">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <path d="M27 30h18"/>
</svg>`;

// Convert the SVG string to a data URL
export const mapPinMinusIconUrl = svgToDataUrl(mapPinMinusSvgString);

// Define the new Leaflet icon for booked stores
export const mapPinMinusIcon = new L.Icon({
  iconUrl: mapPinMinusIconUrl,
  iconRetinaUrl: mapPinMinusIconUrl,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24],
  shadowUrl: MarkerShadow.src,
  shadowSize: [41, 41],
});
