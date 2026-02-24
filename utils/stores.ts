'use server';

import { createClient } from '@/utils/supabase/server';

export async function fetchUserStores(userId: string) {
  const supabase = createClient();

  // First get status logs
  const { data: storeStatuses, error: statusError } = await supabase
    .from('store_status_logs')
    .select('*')
    .eq('modifier', userId)
    .order('store_id')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (statusError) {
    console.error('Error fetching store statuses:', statusError);
    return [];
  }

  // Get photos for this user (from "Mi trovo qui")
  const { data: storePhotos, error: photosError } = await supabase
    .from('store_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (photosError) {
    console.error('Error fetching store photos:', photosError);
  }

  // Get generic photos for this user (from "Inserisci foto")
  const { data: genericPhotos, error: genericPhotosError } = await supabase
    .from('generic_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (genericPhotosError) {
    console.error('Error fetching generic photos:', genericPhotosError);
  }

  // Filter to keep only the latest status for each store
  const storeMap = new Map();
  storeStatuses?.forEach((status) => {
    if (!storeMap.has(status.store_id)) {
      storeMap.set(status.store_id, status);
    }
  });

  // Get unique store IDs from status logs, store photos, and generic photos
  const photoStoreIds = storePhotos?.map((photo) => photo.store_id) || [];
  const genericPhotoStoreIds = genericPhotos?.map((photo) => photo.store_id) || [];
  const statusStoreIds = Array.from(storeMap.keys());
  const uniqueStoreIds = Array.from(new Set([...statusStoreIds, ...photoStoreIds, ...genericPhotoStoreIds]));

  // Fetch store details for these IDs (with client name)
  const { data: storeDetails, error: storeError } = await supabase
    .from('stores')
    .select('*, client:clients(id, name)')
    .in('id', uniqueStoreIds);

  if (storeError) {
    console.error('Error fetching store details:', storeError);
    return [];
  }

  // Create a map of store details for easy lookup
  const storeDetailsMap = new Map(
    storeDetails?.map((store) => [store.id, store])
  );

  const getClientName = (store: (typeof storeDetails)[0]) =>
    store?.client && typeof store.client === 'object' && 'name' in store.client
      ? (store.client as { name: string }).name
      : null;

  // Combine status logs and photos into a unified array
  const statusEntries = Array.from(storeMap.values())
    .map((status) => {
      const store = storeDetailsMap.get(status.store_id);
      return {
        type: 'status' as const,
        store_id: status.store_id,
        store_name: store?.name,
        address: store?.address,
        cap: store?.cap,
        comune: store?.comune,
        provincia: store?.provincia,
        status: store?.status || '',
        created_at: status.created_at,
        owner_name: store?.owner_name,
        phone: store?.phone,
        category: store?.category,
        location: store?.location,
        coordinates: store?.coordinates,
        client_id: store?.client_id ?? null,
        client_name: getClientName(store),
      };
    })
    .filter((store) => store.status !== 'free');

  // Add photo entries (from "Mi trovo qui")
  const photoEntries = (storePhotos || []).map((photo) => {
    const store = storeDetailsMap.get(photo.store_id);
    return {
      type: 'photo' as const,
      store_id: photo.store_id,
      store_name: store?.name,
      address: store?.address,
      cap: store?.cap,
      comune: store?.comune,
      provincia: store?.provincia,
      status: store?.status || '',
      created_at: photo.created_at,
      owner_name: store?.owner_name,
      phone: store?.phone,
      category: store?.category,
      location: store?.location,
      coordinates: store?.coordinates,
      photo_url: photo.photo_url,
      client_id: store?.client_id ?? null,
      client_name: getClientName(store),
    };
  });

  // Add generic photo entries (from "Inserisci foto")
  const genericPhotoEntries = (genericPhotos || []).map((photo) => {
    const store = storeDetailsMap.get(photo.store_id);
    return {
      type: 'photo' as const,
      store_id: photo.store_id,
      store_name: store?.name,
      address: store?.address,
      cap: store?.cap,
      comune: store?.comune,
      provincia: store?.provincia,
      status: store?.status || '',
      created_at: photo.created_at,
      owner_name: store?.owner_name,
      phone: store?.phone,
      category: store?.category,
      location: store?.location,
      coordinates: store?.coordinates,
      photo_url: photo.photo_url,
      client_id: store?.client_id ?? null,
      client_name: getClientName(store),
    };
  });

  // Combine and sort by created_at (most recent first)
  const allEntries = [...statusEntries, ...photoEntries, ...genericPhotoEntries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return allEntries;
}
