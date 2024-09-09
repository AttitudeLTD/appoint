import L, { LatLngExpression } from 'leaflet';

// Function to convert an SVG element to a data URL
export const svgToDataUrl = (svgString: string) => {
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
};

// Generate the SVG string for Navigation2 icon with a light blue fill
export const navigationSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="lightblue" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation-2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>`;

// Convert the SVG string to a data URL
export const navigationIconUrl = svgToDataUrl(navigationSvgString);

// Define your custom Leaflet icon using the SVG data URL
export const customNavIcon = new L.Icon({
  iconUrl: navigationIconUrl,
  iconRetinaUrl: navigationIconUrl,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
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
