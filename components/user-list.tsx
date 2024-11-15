'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { Info, List, Navigation, Store } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { fetchUserStores } from '@/utils/stores';
import { getStatusLabel } from '@/utils/utils';
import { getMyLoc, parseCoords } from '@/utils/navigation';

export function UserList() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function loadStores() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const storesData = await fetchUserStores(user.id);
        console.log(storesData);
        setStores(storesData);
      }
    }

    loadStores();
  }, []);

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
        hideClose
        showPanelToggle
        onPanelToggle={() => setIsExpanded(!isExpanded)}
        className={cn(
          'h-[96%] sm:h-[385px] sm:rounded-t-[10px] z-[1000] overflow-y-auto p-0 transition-[height]',
          isExpanded && 'h-[75vh] sm:h-[75vh]'
        )}
      >
        <SheetHeader className='sticky top-0 bg-background p-4 border-b backdrop-blur-sm'>
          <div className='absolute inset-0 bg-background/80' />
          <SheetTitle className='relative z-10'>Attività in corso</SheetTitle>
        </SheetHeader>
        <div className='mt-6 p-6 overflow-y-auto'>
          {stores.map((store) => (
            <div
              key={store.store_id}
              className='flex items-center justify-between p-4 mb-3 border rounded-lg'
            >
              <div className='flex items-center gap-3'>
                <Store
                  className={cn('h-5 w-5', {
                    'text-[#ffbb00]': store.status === 'in_progress',
                    'text-[#039855]': store.status === 'concluded',
                    'text-[#DE2E21]': store.status === 'failed',
                    'text-gray-500': ![
                      'in_progress',
                      'concluded',
                      'failed',
                    ].includes(store.status),
                  })}
                />
                <div>
                  <h3 className='font-medium'>{store.store_name}</h3>
                  <p className='text-sm text-gray-500'>{store.address}</p>
                  <p className='text-sm text-gray-500'>
                    {getStatusLabel(store.status)}
                  </p>
                </div>
              </div>
              <div className='flex gap-2'>
                <Button variant='outline' size='icon' className='h-8 w-8'>
                  <Info className='h-4 w-4' />
                </Button>
                <Button
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  onClick={() => {
                    console.log(store.coordinates);
                    getMyLoc((coord) => {
                      if (coord && Array.isArray(coord)) {
                        const storeCoordinates = parseCoords(store.coordinates);
                        if (storeCoordinates) {
                          const [lat, lng] = coord;
                          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
                          window.open(gmapsUrl, '_blank');
                        }
                      }
                    });
                  }}
                >
                  <Navigation className='h-4 w-4' />
                </Button>
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
