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

  // Filter to keep only the latest status for each store
  const storeMap = new Map();
  storeStatuses?.forEach((status) => {
    if (!storeMap.has(status.store_id)) {
      storeMap.set(status.store_id, status);
    }
  });

  // Get unique store IDs
  const uniqueStoreIds = Array.from(storeMap.keys());

  // Fetch store details for these IDs
  const { data: storeDetails, error: storeError } = await supabase
    .from('stores')
    .select('id, name, address, status')
    .in('id', uniqueStoreIds);

  if (storeError) {
    console.error('Error fetching store details:', storeError);
    return [];
  }

  // Create a map of store details for easy lookup
  const storeDetailsMap = new Map(
    storeDetails?.map((store) => [store.id, store])
  );

  // Combine the data
  return Array.from(storeMap.values())
    .map((status) => {
      const store = storeDetailsMap.get(status.store_id);
      return {
        store_id: status.store_id,
        store_name: store?.name,
        address: store?.address,
        status: store?.status || '',
        created_at: status.created_at,
      };
    })
    .filter((store) => store.status !== 'free');
}
