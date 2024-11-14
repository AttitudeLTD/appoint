import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { List, Store } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';

interface StoreWithStatus {
  store_id: string;
  store_name: string;
  address: string;
  status: string;
  created_at: string;
}

export async function UserList() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // First get status logs
  const { data: storeStatuses, error: statusError } = await supabase
    .from('store_status_logs')
    .select('*')
    .eq('modifier', user?.id)
    .order('store_id')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (statusError) {
    console.error('Error fetching store statuses:', statusError);
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
  }

  // Create a map of store details for easy lookup
  const storeDetailsMap = new Map(
    storeDetails?.map((store) => [store.id, store])
  );

  // Combine the data
  const stores = Array.from(storeMap.values()).map((status) => {
    const store = storeDetailsMap.get(status.store_id);
    return {
      store_id: status.store_id,
      store_name: store?.name,
      address: store?.address,
      status: store?.status,
      created_at: status.created_at,
    };
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='ghost' className='p-0 h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8 flex items-center justify-center'>
            <List className='h-4 w-4' />
          </Avatar>
        </Button>
      </SheetTrigger>
      <SheetContent
        side='bottom'
        className='h-[96%] sm:h-[385px] sm:rounded-t-[10px] z-[1000]'
      >
        <SheetHeader>
          <SheetTitle>Attività in corso</SheetTitle>
        </SheetHeader>
        <div className='mt-6'>
          {stores.map((store) => (
            <div
              key={store.store_id}
              className='flex items-center justify-between p-4 mb-3 border rounded-lg hover:bg-gray-50'
            >
              <div className='flex items-center gap-3'>
                <Store className='h-5 w-5 text-gray-500' />
                <div>
                  <h3 className='font-medium'>{store.store_name}</h3>
                  <p className='text-sm text-gray-500'>{store.address}</p>
                  <p className='text-sm text-gray-500'>{store.status}</p>
                </div>
              </div>
              <div className='text-sm font-medium text-gray-500'>
                {new Date(store.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {stores.length === 0 && (
            <div className='text-center text-gray-500 mt-4'>
              Nessuna attività in corso
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
