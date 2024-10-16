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
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#205188" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-plus">
  <path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738"/>
  <circle cx="12" cy="10" r="3"/>
  <path d="M16 18h6"/>
  <path d="M19 15v6"/>
</svg>
`;

// Convert the SVG string to a data URL
export const mapPinPlusIconUrl = svgToDataUrl(mapPinPlusSvgString);

// Define your custom Leaflet store icon using the MapPinPlus SVG data URL
export const storeIcon = new L.Icon({
  iconUrl: mapPinPlusIconUrl,
  iconRetinaUrl: mapPinPlusIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
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

export const parseCoords = (coordinates: string): [number, number] | null => {
  const match = coordinates.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  if (match) {
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    if (!isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    } else {
      console.error(`Invalid numeric values in coordinates: ${coordinates}`);
    }
  } else {
    console.error(`Invalid POINT format: ${coordinates}`);
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
