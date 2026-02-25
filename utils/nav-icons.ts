import L from 'leaflet';
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

// Free Store Icon (Green)
const freeStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="#1B304E">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <circle cx="36" cy="30" r="6" fill="white" stroke="none"/>
</svg>`;
const freeStoreIconUrl = svgToDataUrl(freeStoreSvgString);
export const freePin = new L.Icon({
  iconUrl: freeStoreIconUrl,
  iconRetinaUrl: freeStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [60, 45],
});

// In Progress Store Icon (Yellow)
const inProgressStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="#ffbb00" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-clock"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/><path d="M12 8v2l1 1"/></svg>`;
const inProgressStoreIconUrl = svgToDataUrl(inProgressStoreSvgString);
export const progressPin = new L.Icon({
  iconUrl: inProgressStoreIconUrl,
  iconRetinaUrl: inProgressStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [60, 45],
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
  shadowSize: [60, 45],
});

// Failed Store Icon (Red) - Changed to prohibition symbol
const failedStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#DE2E21" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <circle cx="12" cy="10" r="4" fill="#DE2E21" stroke="white"/>
  <line x1="9" y1="7" x2="15" y2="13" stroke="white" stroke-width="1.5"/>
</svg>`;
const failedStoreIconUrl = svgToDataUrl(failedStoreSvgString);
export const failedPin = new L.Icon({
  iconUrl: failedStoreIconUrl,
  iconRetinaUrl: failedStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [60, 45],
});

// Not Interested Store Icon (Red with X)
const notInterestedStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#DE2E21" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <path d="m14.5 7.5-5 5"/>
  <path d="m9.5 7.5 5 5"/>
</svg>`;
const notInterestedStoreIconUrl = svgToDataUrl(notInterestedStoreSvgString);
export const notInterestedPin = new L.Icon({
  iconUrl: notInterestedStoreIconUrl,
  iconRetinaUrl: notInterestedStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [60, 45],
});

// Already Client Store Icon (Green with star)
const alreadyClientStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#039855" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <path d="M12 7l1 2.5h2.5l-2 1.5 1 2.5-2.5-1.5-2.5 1.5 1-2.5-2-1.5h2.5z"/>
</svg>`;
const alreadyClientStoreIconUrl = svgToDataUrl(alreadyClientStoreSvgString);
export const alreadyClientPin = new L.Icon({
  iconUrl: alreadyClientStoreIconUrl,
  iconRetinaUrl: alreadyClientStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [60, 45],
});

const freeStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" fill="#0d2031">
  <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0"/>
  <circle cx="36" cy="30" r="6" fill="white" stroke="none"/>
</svg>`;
const freeStoreMutedIconUrl = svgToDataUrl(freeStoreMutedSvgString);
export const freePinM = new L.Icon({
  iconUrl: freeStoreMutedIconUrl,
  iconRetinaUrl: freeStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});

const inProgressStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="#594b00" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-clock"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/><path d="M12 8v2l1 1"/></svg>`;
const inProgressStoreMutedIconUrl = svgToDataUrl(inProgressStoreMutedSvgString);
export const progressPinM = new L.Icon({
  iconUrl: inProgressStoreMutedIconUrl,
  iconRetinaUrl: inProgressStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});

const concludedStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#022919" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-check-inside"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="m9 10 2 2 4-4"/></svg>`;
const concludedStoreMutedIconUrl = svgToDataUrl(concludedStoreMutedSvgString);
export const closedPinM = new L.Icon({
  iconUrl: concludedStoreMutedIconUrl,
  iconRetinaUrl: concludedStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});

// Failed Store Icon Muted (Red - prohibition symbol)
const failedStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#4b0e0a" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <circle cx="12" cy="10" r="4" fill="#4b0e0a" stroke="white"/>
  <line x1="9" y1="7" x2="15" y2="13" stroke="white" stroke-width="1.5"/>
</svg>`;
const failedStoreMutedIconUrl = svgToDataUrl(failedStoreMutedSvgString);
export const failedPinM = new L.Icon({
  iconUrl: failedStoreMutedIconUrl,
  iconRetinaUrl: failedStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});

// Not Interested Store Icon Muted (Red with X)
const notInterestedStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#4b0e0a" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <path d="m14.5 7.5-5 5"/>
  <path d="m9.5 7.5 5 5"/>
</svg>`;
const notInterestedStoreMutedIconUrl = svgToDataUrl(
  notInterestedStoreMutedSvgString
);
export const notInterestedPinM = new L.Icon({
  iconUrl: notInterestedStoreMutedIconUrl,
  iconRetinaUrl: notInterestedStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});

// Already Client Store Icon Muted (Green with star)
const alreadyClientStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#022919" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <path d="M12 7l1 2.5h2.5l-2 1.5 1 2.5-2.5-1.5-2.5 1.5 1-2.5-2-1.5h2.5z"/>
</svg>`;
const alreadyClientStoreMutedIconUrl = svgToDataUrl(alreadyClientStoreMutedSvgString);
export const alreadyClientPinM = new L.Icon({
  iconUrl: alreadyClientStoreMutedIconUrl,
  iconRetinaUrl: alreadyClientStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});

// Non Existent Store Icon (Gray with X-circle)
const nonExistentStoreSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#6b7280" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <circle cx="12" cy="10" r="4" fill="#6b7280" stroke="white"/>
  <path d="m9 7 6 6"/>
  <path d="m15 7-6 6"/>
</svg>`;
const nonExistentStoreIconUrl = svgToDataUrl(nonExistentStoreSvgString);
export const nonExistentPin = new L.Icon({
  iconUrl: nonExistentStoreIconUrl,
  iconRetinaUrl: nonExistentStoreIconUrl,
  iconSize: [40, 40],
  iconAnchor: [24, 50],
  popupAnchor: [0, -48],
  shadowUrl: MarkerShadow.src,
  shadowSize: [60, 45],
});

/**
 * Crea un pin "free" con il logo del cliente al posto del pallino colorato.
 * Usa L.DivIcon in modo da poter usare un <img> normale (nessuna codifica base64).
 */
export function createFreePinWithLogo(logoUrl: string): L.DivIcon {
  // circle cx=36 cy=30 r=14 in viewBox 0 0 72 72 → rendered 52x52:
  // center pixel (26, 21.7), radius 10.1 → logo 18x18 at top≈13 left≈17
  const html = `
    <div style="position:relative;width:52px;height:52px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="52" height="52" style="display:block">
        <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0" fill="#1B304E"/>
        <circle cx="36" cy="30" r="14" fill="white" stroke="none"/>
      </svg>
      <img src="${logoUrl}" style="position:absolute;top:13px;left:17px;width:18px;height:18px;border-radius:50%;object-fit:cover;pointer-events:none" />
    </div>`;
  return new L.DivIcon({
    html,
    className: '',
    iconSize: [52, 52],
    iconAnchor: [26, 47],
    popupAnchor: [0, -48],
  });
}

/** Versione attenuata (store gestito da altro agente). */
export function createFreePinMutedWithLogo(logoUrl: string): L.DivIcon {
  // rendered 38x38, circle center ~(19, 15.8), radius ~7.4 → logo 14x14 at top≈9 left≈12
  const html = `
    <div style="position:relative;width:38px;height:38px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="38" height="38" style="display:block">
        <path d="M60 30c0 14.979-16.617 30.579-22.197 35.397a3 3 0 0 1-3.606 0C28.617 60.579 12 44.979 12 30a24 24 0 0 1 48 0" fill="#0d2031"/>
        <circle cx="36" cy="30" r="14" fill="white" stroke="none"/>
      </svg>
      <img src="${logoUrl}" style="position:absolute;top:9px;left:12px;width:14px;height:14px;border-radius:50%;object-fit:cover;pointer-events:none" />
    </div>`;
  return new L.DivIcon({
    html,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 34],
    popupAnchor: [0, -36],
  });
}

// Non Existent Store Icon Muted (Gray with X-circle)
const nonExistentStoreMutedSvgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#374151" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
  <circle cx="12" cy="10" r="4" fill="#374151" stroke="white"/>
  <path d="m9 7 6 6"/>
  <path d="m15 7-6 6"/>
</svg>`;
const nonExistentStoreMutedIconUrl = svgToDataUrl(nonExistentStoreMutedSvgString);
export const nonExistentPinM = new L.Icon({
  iconUrl: nonExistentStoreMutedIconUrl,
  iconRetinaUrl: nonExistentStoreMutedIconUrl,
  iconSize: [30, 30],
  iconAnchor: [14, 40],
  popupAnchor: [0, -38],
  shadowUrl: MarkerShadow.src,
  shadowSize: [45, 30],
});
