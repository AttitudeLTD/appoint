import L, { LatLngExpression } from 'leaflet';
import MarkerShadow from '../node_modules/leaflet/dist/images/marker-shadow.png';

// Function to convert an SVG element to a data URL
export const svgToDataUrl = (svgString: string) => {
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
};

const navigationSvgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="lightblue" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation-2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>`;
const navigationIconUrl = svgToDataUrl(navigationSvgString);
export const navIcon = new L.Icon({
  iconUrl: navigationIconUrl,
  iconRetinaUrl: navigationIconUrl,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const modifiedByOtherUserSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="#000000" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <path d="M36 21v18"/>
  <path d="M27 30h18"/>
</svg>`;
const modifiedByOtherUserIconUrl = svgToDataUrl(modifiedByOtherUserSvgString);
export const modifiedByOtherUserIcon = new L.Icon({
  iconUrl: modifiedByOtherUserIconUrl,
  iconRetinaUrl: modifiedByOtherUserIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

// Free Store Icon (Green)
const freeStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="#205188" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <path d="M36 21v18"/>
  <path d="M27 30h18"/>
</svg>`;
const freeStoreIconUrl = svgToDataUrl(freeStoreSvgString);
export const freePin = new L.Icon({
  iconUrl: freeStoreIconUrl,
  iconRetinaUrl: freeStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

// In Progress Store Icon (Yellow)
const inProgressStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="#ffbb00" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-minus-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="M9 10h6"/></svg>`;
const inProgressStoreIconUrl = svgToDataUrl(inProgressStoreSvgString);
export const progressPin = new L.Icon({
  iconUrl: inProgressStoreIconUrl,
  iconRetinaUrl: inProgressStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

// Concluded Store Icon (Blue)
const concludedStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#039855" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-check-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="m9 10 2 2 4-4"/></svg>`;
const concludedStoreIconUrl = svgToDataUrl(concludedStoreSvgString);
export const closedPin = new L.Icon({
  iconUrl: concludedStoreIconUrl,
  iconRetinaUrl: concludedStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

// Failed Store Icon (Red)
const failedStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#DE2E21" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-x-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="m14.5 7.5-5 5"/><path d="m9.5 7.5 5 5"/></svg>`;
const failedStoreIconUrl = svgToDataUrl(failedStoreSvgString);
export const failedPin = new L.Icon({
  iconUrl: failedStoreIconUrl,
  iconRetinaUrl: failedStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

const freeStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="#0d2031" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <path d="M36 21v18"/>
  <path d="M27 30h18"/>
</svg>`;
const freeStoreMutedIconUrl = svgToDataUrl(freeStoreMutedSvgString);
export const freePinM = new L.Icon({
  iconUrl: freeStoreMutedIconUrl,
  iconRetinaUrl: freeStoreMutedIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

const inProgressStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="#594b00" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-minus-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="M9 10h6"/></svg>`;
const inProgressStoreMutedIconUrl = svgToDataUrl(inProgressStoreMutedSvgString);
export const progressPinM = new L.Icon({
  iconUrl: inProgressStoreMutedIconUrl,
  iconRetinaUrl: inProgressStoreMutedIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

const concludedStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#022919" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-check-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="m9 10 2 2 4-4"/></svg>`;
const concludedStoreMutedIconUrl = svgToDataUrl(concludedStoreMutedSvgString);
export const closedPinM = new L.Icon({
  iconUrl: concludedStoreMutedIconUrl,
  iconRetinaUrl: concludedStoreMutedIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [80, 60],
});

const failedStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#4b0e0a" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-x-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="m14.5 7.5-5 5"/><path d="m9.5 7.5 5 5"/></svg>`;
const failedStoreMutedIconUrl = svgToDataUrl(failedStoreMutedSvgString);
export const failedPinM = new L.Icon({
  iconUrl: failedStoreMutedIconUrl,
  iconRetinaUrl: failedStoreMutedIconUrl,
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
