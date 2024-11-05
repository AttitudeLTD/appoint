import Image from 'next/image';
import {
  Phone,
  Navigation,
  Settings,
  MailPlus,
  FileCheck,
  Loader,
} from 'lucide-react';

import { SelectComponent } from './select';
import { Button } from './ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';

import { StorePopupProps } from '@/types';
import { getStatusLabel, statuses } from '@/utils/utils';
import { parseCoords } from '@/utils/navigation';

const StorePopup: React.FC<StorePopupProps> = ({
  store,
  coord,
  statusLogs,
  loadingStatus,
  loadingEmail,
  storeStatuses,
  fetchStatusLogs,
  handleStatusChangeAttempt,
  handleSendEmail,
}) => {
  const storeCoordinates = parseCoords(store.location);

  return (
    <div>
      <div className='flex items-center'>
        <Image
          className='rounded-full shadow-md'
          src='/store.jpeg'
          alt='Store'
          width={50}
          height={50}
        />
        <div className='ml-3'>
          <p className='leading-tight'>
            <span className='text-lg font-semibold'>{store.name}</span>
            <br />
            <span className='text-base text-gray-400'>{store.category}</span>
            <br />
            <span className='text-sm text-gray-500'>{store.address}</span>
          </p>
        </div>
      </div>

      <div className='flex flex-col gap-2 mt-2'>
        <Button
          variant='secondary'
          className='w-full bg-[#1B304E] hover:bg-[#224677]'
          onClick={() => {
            if (
              Array.isArray(coord) &&
              coord.length === 2 &&
              storeCoordinates
            ) {
              const [lat, lng] = coord;
              const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
              window.open(gmapsUrl, '_blank');
            }
          }}
        >
          <Navigation className='mr-2' /> Indicazioni
        </Button>

        <Button
          variant='secondary'
          className='w-full bg-[#1B304E] hover:bg-[#224677]'
          onClick={() => {
            window.open(`tel:${store.phone}`, '_self');
          }}
        >
          <Phone className='mr-2' /> Chiama
        </Button>

        <Sheet>
          <SheetTrigger onClick={() => fetchStatusLogs(store.id)}>
            <Button
              variant='secondary'
              className='w-full bg-[#1B304E] hover:bg-[#224677]'
            >
              <Settings className='mr-2' /> Gestisci
            </Button>
          </SheetTrigger>
          <SheetContent className='z-1000 flex flex-col h-screen overflow-y-auto p-4'>
            <SheetHeader>
              <SheetTitle className='text-xl font-bold'>
                Info punto vendita
              </SheetTitle>
              <SheetDescription>
                Qui trovi i dettagli dell'attività.
              </SheetDescription>
            </SheetHeader>

            <div className='py-4'>
              <div className='py-3 border-b border-gray-200'>
                <strong className='text-lg font-semibold'>{store.name}</strong>
              </div>
              <div className='py-3 border-b border-gray-200'>
                <p className='text-base text-gray-400 font-medium'>
                  Categoria:
                </p>
                <p className='text-base text-gray-600'>{store.category}</p>
              </div>
              <div className='py-3'>
                <p className='text-base text-gray-400 font-medium'>
                  Indirizzo:
                </p>
                <p className='text-base text-gray-600'>{store.address}</p>
              </div>
            </div>

            <div className='flex flex-col gap-2 mb-2'>
              <SelectComponent
                placeholder='Stato avanzamento'
                value={storeStatuses[store.id] || store.status}
                onChange={(newStatus) => {
                  if (newStatus) {
                    handleStatusChangeAttempt(store.id, newStatus);
                  }
                }}
                options={statuses}
                disabled={loadingStatus}
              />
            </div>

            {storeStatuses[store.id] === 'in_progress' && (
              <Button
                className='w-full'
                onClick={() => handleSendEmail(store)}
                disabled={loadingEmail}
              >
                {loadingEmail ? (
                  <Loader className='animate-spin mr-2' />
                ) : (
                  <MailPlus className='mr-2' />
                )}
                Invia e-mail
              </Button>
            )}

            {storeStatuses[store.id] === 'concluded' && (
              <Button
                onClick={() =>
                  window.open('https://appraise.attitudeltd.com', '_blank')
                }
              >
                <FileCheck className='mr-2' /> Compila distinta
              </Button>
            )}

            {statusLogs?.length > 0 && (
              <div className='py-3'>
                <p className='text-lg font-medium text-gray-300 mb-3 border-b border-gray-600 pb-2'>
                  Storico Modifiche
                </p>
                {statusLogs.map((log) => (
                  <div
                    key={log.id}
                    className='mb-3 p-3 bg-gray-800 rounded-lg shadow-md border border-gray-700'
                  >
                    <p className='text-sm text-gray-400 mb-1'>
                      <strong>Data:</strong>{' '}
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                    <p className='text-sm text-gray-400 mb-1'>
                      <strong>Stato Precedente:</strong>{' '}
                      <span className='text-gray-200'>
                        {getStatusLabel(log.prev)}
                      </span>
                    </p>
                    <p className='text-sm text-gray-400'>
                      <strong>Nuovo Stato:</strong>{' '}
                      <span className='text-gray-200'>
                        {getStatusLabel(log.new)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
            <SheetFooter className='mt-auto'>
              <SheetClose>
                <Button type='button' className='w-full'>
                  Chiudi
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default StorePopup;
