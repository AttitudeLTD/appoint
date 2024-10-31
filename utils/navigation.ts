import { LatLngExpression } from 'leaflet';

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
