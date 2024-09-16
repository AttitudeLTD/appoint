'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

import {
  GoogleMap,
  useJsApiLoader,
  MarkerF,
  InfoWindowF,
} from '@react-google-maps/api';
import { IoMdClose } from 'react-icons/io';
import { Button } from '@/components/ui/button';

interface MapProps {
  searchOriginLatitude?: number;
  searchOriginLongitude?: number;
  setSetsearchOriginLatitude: React.Dispatch<
    React.SetStateAction<number | undefined>
  >;
  setSetsearchOriginLongitude: React.Dispatch<
    React.SetStateAction<number | undefined>
  >;
}

const Map: React.FC<MapProps> = ({
  searchOriginLatitude,
  searchOriginLongitude,
  setSetsearchOriginLatitude,
  setSetsearchOriginLongitude,
}) => {
  const supabase = createClient();

  const [isInfoWindowOpen, setIsInfoWindowOpen] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  }>({ lat: 0, lng: 0 });
  const [stores, setStores] = useState<any>([]);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.error(err);
      }
    );
  }, []);

  const options = {
    mapId: '4f78d265b07eec57',
    mapTypeControl: false,
    zoomControl: false,
    fullscreenControl: true,
    clickableIcons: true,
    scrollwheel: true,
    streetViewControl: true,
  };

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  const locationIcon = useMemo(() => {
    if (isLoaded) {
      return {
        url: '/user-location.png',
        scaledSize: new window.google.maps.Size(20, 20),
      };
    }
  }, [isLoaded]);

  const pinIcon = useMemo(() => {
    if (isLoaded) {
      return {
        url: '/attitude-marker.png',
        scaledSize: new window.google.maps.Size(50, 50),
      };
    }
  }, [isLoaded]);

  const MarkerClicked = (index: number) => {
    setIsInfoWindowOpen(isInfoWindowOpen === index ? null : index);
  };

  // Function to fetch latlng from address using Geocoder
  const fetchLatLngFromAddress = async (
    address: string
  ): Promise<{ lat: number; lng: number }> => {
    const geocoder = new window.google.maps.Geocoder();

    return new Promise((resolve, reject) => {
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results![0]) {
          const { lat, lng } = results![0].geometry.location;
          resolve({ lat: lat(), lng: lng() });
        } else {
          reject(status);
        }
      });
    });
  };

  const fetchStores = async (bounds: google.maps.LatLngBounds) => {
    const { south, west, north, east } = {
      south: bounds.getSouthWest().lat(),
      west: bounds.getSouthWest().lng(),
      north: bounds.getNorthEast().lat(),
      east: bounds.getNorthEast().lng(),
    };

    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .filter('lat', 'gte', south)
      .filter('lat', 'lte', north)
      .filter('lng', 'gte', west)
      .filter('lng', 'lte', east);

    if (error) {
      console.error(error);
      return;
    }

    const updatedStores = await Promise.all(
      data.map(async (store: any) => {
        try {
          const { lat, lng } = await fetchLatLngFromAddress(
            `${store.indirizzo}, ${store.imprese_cap} ${store.city}, ${store.country}`
          );
          return { ...store, lat, lng };
        } catch (error) {
          console.error(
            `Error fetching latlng for ${`${store.indirizzo}, ${store.imprese_cap} ${store.city}, ${store.country}`}: ${error}`
          );
          return store; // Return original store object if fetching fails
        }
      })
    );

    setStores(updatedStores);
  };

  useEffect(() => {
    if (isLoaded && map) {
      fetchStores(map.getBounds() as google.maps.LatLngBounds);
    }
  }, [isLoaded, map]);

  const handleDirections = (lat: number, lng: number) => {
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(directionsUrl, '_blank');
  };

  const handleMapIdle = useCallback(async () => {
    if (map) {
      const bounds = map.getBounds();
      if (bounds) {
        await fetchStores(bounds);
      }
    }
  }, [map]);

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '90vh' }}
      options={options}
      center={userLocation}
      zoom={16}
      onClick={() => setIsInfoWindowOpen(null)}
      onIdle={handleMapIdle}
      onLoad={onLoad}
    >
      <MarkerF position={userLocation} icon={locationIcon} />

      {stores.map((store: any, index: number) => (
        <MarkerF
          key={index}
          position={{ lat: store.lat, lng: store.lng }} // Use fetched latlng
          icon={pinIcon}
          visible={true}
          draggable={false}
          onClick={() => MarkerClicked(index)}
        >
          {isInfoWindowOpen === index && (
            <InfoWindowF
              onCloseClick={() => setIsInfoWindowOpen(null)}
              position={{ lat: store.lat, lng: store.lng }}
              onDomReady={() => {
                const closeButton = document.querySelector(
                  '.gm-ui-hover-effect'
                );
                if (closeButton) {
                  closeButton.remove();
                }
              }}
            >
              <div className='w-80 -mt-0.5 text-black'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center'>
                    <img
                      src='https://images.unsplash.com/photo-1716547286288-df00f829a799?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxlZGl0b3JpYWwtZmVlZHwzNXx8fGVufDB8fHx8fA%3D%3D'
                      alt='point-store-image'
                      className='w-10 h-10 rounded-full'
                    />
                    <div className='pl-2'>
                      <h3 className='text-xl font-bold'>{store.name}</h3>
                      <p>{store.name}</p>
                    </div>
                  </div>
                  <IoMdClose
                    size={23}
                    className='cursor-pointer -mt-6'
                    style={{ color: '#4B5563', transition: 'color 0.2s' }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = '#000000')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = '#4B5563')
                    }
                    onClick={() => setIsInfoWindowOpen(null)}
                  />
                </div>
                <p className='p-2'>
                  Lorem ipsum, dolor sit amet consectetur adipisicing elit.
                  Distinctio rem laborum in velit recusandae praesentium,
                  consequatur, similique cum magnam dignissimos maiores aliquid.
                  Officia ducimus hic magni perspiciatis facere corporis a.
                </p>
                <p>{store.indirizzo}</p>
                <div className='p-1 space-x-1'>
                  <Button
                    onClick={() => handleDirections(store.lat, store.lng)}
                  >
                    Portami Lì
                  </Button>
                  <Button>Prenota</Button>
                  <Button>Chiama</Button>
                </div>
              </div>
            </InfoWindowF>
          )}
        </MarkerF>
      ))}
    </GoogleMap>
  ) : (
    <></>
  );
};

export default Map;
