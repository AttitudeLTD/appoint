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
import { Info, List, Navigation, Store, Camera, Loader, X, Download } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { fetchUserStores } from '@/utils/stores';
import { getStatusLabel } from '@/utils/utils';
import { getMyLoc } from '@/utils/navigation';

export function UserList() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [coord, setCoord] = useState<[number, number] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const supabase = createClient();

  // Load stores function
  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const storesData = await fetchUserStores(user.id);
        setStores(storesData);
        setIsFirstLoad(false);
      }
    } catch (error) {
      console.error('Error loading stores:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Download CSV function
  const handleDownloadCSV = () => {
    if (stores.length === 0) {
      return;
    }

    // CSV Headers
    const headers = [
      'Tipo',
      'Nome Attività',
      'Indirizzo',
      'CAP',
      'Comune',
      'Provincia',
      'Stato',
      'Data',
      'URL Foto'
    ];

    // Convert stores to CSV rows
    const csvRows = stores.map((entry) => {
      const fullAddress = [
        entry.address,
        entry.cap,
        entry.comune,
        entry.provincia ? `(${entry.provincia})` : null,
      ].filter(Boolean).join(', ');

      return [
        entry.type === 'photo' ? 'Foto' : 'Stato',
        entry.store_name || '',
        entry.address || '',
        entry.cap || '',
        entry.comune || '',
        entry.provincia || '',
        entry.type === 'photo' ? 'Foto scattata' : getStatusLabel(entry.status),
        new Date(entry.created_at).toLocaleString('it-IT'),
        entry.type === 'photo' ? (entry.photo_url || '') : ''
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => 
        row.map(cell => {
          // Escape commas and quotes in CSV
          const cellStr = String(cell || '');
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attivita-in-corso-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Initial load and location
  useEffect(() => {
    // Get user location
    getMyLoc((coords) => {
      if (coords) {
        setCoord(coords as [number, number]);
      }
    });
  }, []);

  // Reload stores when sheet opens
  useEffect(() => {
    if (isOpen) {
      loadStores();
    }
  }, [isOpen, loadStores]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant='ghost' className='p-0 h-8 w-8 rounded-full hover:bg-white/20 transition-colors'>
          <Avatar className='h-8 w-8 flex items-center justify-center bg-transparent'>
            <List className='h-4 w-4 text-white' />
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
        style={{ backgroundColor: '#224677' }}
      >
        <SheetHeader className='sticky top-0 p-4 border-b border-white/20 backdrop-blur-sm' style={{ backgroundColor: '#224677' }}>
          <div className='absolute inset-0' style={{ backgroundColor: '#224677' }} />
          <div className='relative z-10 flex items-center justify-between'>
            <SheetTitle className='flex items-center gap-2 text-white'>
              Attività in corso
              {loading && (
                <Loader className='h-4 w-4 animate-spin text-white' />
              )}
            </SheetTitle>
            <div className='flex items-center gap-2'>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8 text-white hover:bg-white/20'
                onClick={handleDownloadCSV}
                title='Scarica CSV'
              >
                <Download className='h-4 w-4' />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8 text-white hover:bg-white/20'
                onClick={() => setIsOpen(false)}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </SheetHeader>
        <div className='mt-6 p-6 overflow-y-auto' style={{ backgroundColor: '#224677' }}>
          {stores.map((entry, index) => {
            // Generate unique key for each entry
            const entryKey = entry.type === 'photo' 
              ? `photo-${entry.store_id}-${entry.created_at}-${index}`
              : `status-${entry.store_id}-${entry.created_at}-${index}`;

            return (
              <div
                key={entryKey}
                className='flex items-center justify-between p-4 mb-3 border border-white/20 rounded-lg bg-white/10'
              >
                <div className='flex items-center gap-3 flex-1'>
                  {entry.type === 'photo' ? (
                    <Camera className='h-5 w-5 text-blue-500' />
                  ) : (
                    <Store
                      className={cn('h-5 w-5', {
                        'text-[#ffbb00]': entry.status === 'in_progress',
                        'text-[#039855]':
                          entry.status === 'concluded' ||
                          entry.status === 'already_client',
                        'text-[#DE2E21]':
                          entry.status === 'failed' ||
                          entry.status === 'not_interested',
                        'text-gray-500': 
                          entry.status === 'non_existent' ||
                          ![
                            'in_progress',
                            'concluded',
                            'already_client',
                            'failed',
                            'not_interested',
                            'non_existent',
                          ].includes(entry.status),
                      })}
                    />
                  )}
                  <div className='flex-1 min-w-0'>
                    <h3 className='font-medium text-white'>{entry.store_name}</h3>
                    <p className='text-sm text-white/80'>
                      {entry.address}
                      {entry.cap && `, ${entry.cap}`}
                      {entry.comune && ` ${entry.comune}`}
                      {entry.provincia && ` (${entry.provincia})`}
                    </p>
                    {entry.type === 'photo' ? (
                      <p className='text-sm text-blue-300 font-medium mt-1'>
                        Foto scattata il{' '}
                        {new Date(entry.created_at).toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    ) : (
                      <p className='text-sm text-white/80'>
                        {getStatusLabel(entry.status)}
                      </p>
                    )}
                  </div>
                </div>
                <div className='flex gap-2'>
                  {entry.type === 'photo' && entry.photo_url && (
                    <Button
                      variant='outline'
                      size='icon'
                      className='h-8 w-8'
                      onClick={() => {
                        window.open(entry.photo_url, '_blank');
                      }}
                      title='Visualizza foto'
                    >
                      <Camera className='h-4 w-4' />
                    </Button>
                  )}
                  <Button
                    variant='outline'
                    size='icon'
                    className='h-8 w-8'
                    onClick={() => {
                      if (
                        Array.isArray(coord) &&
                        coord.length === 2 &&
                        entry.coordinates
                      ) {
                        const [lat, lng] = coord;
                        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${entry.coordinates[0]},${entry.coordinates[1]}`;
                        window.open(gmapsUrl, '_blank');
                      }
                    }}
                  >
                    <Navigation className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            );
          })}
          {!loading && stores.length === 0 && (
            <div className='text-center text-white/80 mt-4'>
              Nessuna attività in corso
            </div>
          )}
          {loading && isFirstLoad && stores.length === 0 && (
            <div className='text-center text-gray-500 mt-4'>
              Caricamento...
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
