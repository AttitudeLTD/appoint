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
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="blue" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pinned">
  <path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/>
  <circle cx="12" cy="8" r="2"/>
  <path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"/>
</svg>`;

// Convert the SVG string to a data URL
export const mapPinPlusIconUrl = svgToDataUrl(mapPinPlusSvgString);

// Define your custom Leaflet store icon using the MapPinPlus SVG data URL
export const storeIcon = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1hcC1waW4tcGx1cyI+PHBhdGggZD0iTTE5LjkxNCAxMS4xMDVBNy4yOTggNy4yOTggMCAwIDAgMjAgMTBhOCA4IDAgMCAwLTE2IDBjMCA0Ljk5MyA1LjUzOSAxMC4xOTMgNy4zOTkgMTEuNzk5YTEgMSAwIDAgMCAxLjIwMiAwIDMyIDMyIDAgMCAwIC44MjQtLjczOCIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjMiLz48cGF0aCBkPSJNMTYgMThoNiIvPjxwYXRoIGQ9Ik0xOSAxNXY2Ii8+PC9zdmc+',
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
