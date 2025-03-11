import Image from 'next/image';
import {
  Phone,
  Navigation,
  Settings,
  MailPlus,
  FileCheck,
  Loader,
  Award,
  Medal,
  Trophy,
  Circle,
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

// Function to get tier icon
const getTierIcon = (tier?: string) => {
  if (!tier) return <Circle size={14} />;
  switch (tier.toLowerCase()) {
    case 'gold+':
      return <Trophy size={14} className='text-yellow-500' />;
    case 'gold':
      return <Award size={14} className='text-yellow-400' />;
    case 'silver':
      return <Medal size={14} className='text-gray-400' />;
    case 'bronze':
      return <Circle size={14} className='text-amber-700' />;
    default:
      return <Circle size={14} />;
  }
};

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
  // Filter out 'Disponibile' option if the store is in 'in_progress' status
  const filteredStatuses =
    storeStatuses[store.id] === 'in_progress' || store.status === 'in_progress'
      ? statuses.filter((status) => status.value !== 'free')
      : statuses;

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
            <br />
            <div className='mt-1 inline-flex items-center gap-1'>
              {getTierIcon(store.tier)}
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  !store.tier
                    ? 'bg-gray-100 text-gray-500'
                    : store.tier === 'gold+'
                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                      : store.tier === 'gold'
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        : store.tier === 'silver'
                          ? 'bg-gray-100 text-gray-600 border border-gray-200'
                          : store.tier === 'bronze'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-gray-100 text-gray-500'
                }`}
              >
                {store.tier?.toUpperCase() || 'N/A'}
              </span>
            </div>
          </p>
        </div>
      </div>

      <div className='flex flex-col gap-2 mt-2'>
        <Button
          variant='secondary'
          className='w-full bg-[#1B304E] hover:bg-[#224677] text-white'
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
          className='w-full bg-[#1B304E] hover:bg-[#224677] text-white'
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
              className='w-full bg-[#1B304E] hover:bg-[#224677] text-white'
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
              <div className='py-3 border-b border-gray-200'>
                <p className='text-base text-gray-400 font-medium'>Tier:</p>
                <div className='flex items-center gap-2 mt-1'>
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md ${
                      !store.tier
                        ? 'bg-gray-100'
                        : store.tier === 'gold+'
                          ? 'bg-yellow-50 border border-yellow-200'
                          : store.tier === 'gold'
                            ? 'bg-yellow-50 border border-yellow-100'
                            : store.tier === 'silver'
                              ? 'bg-gray-100 border border-gray-200'
                              : store.tier === 'bronze'
                                ? 'bg-amber-50 border border-amber-200'
                                : 'bg-gray-100'
                    }`}
                  >
                    <span className='mr-1'>
                      {store.tier === 'gold+' && (
                        <Trophy size={18} className='text-yellow-500' />
                      )}
                      {store.tier === 'gold' && (
                        <Award size={18} className='text-yellow-400' />
                      )}
                      {store.tier === 'silver' && (
                        <Medal size={18} className='text-gray-500' />
                      )}
                      {store.tier === 'bronze' && (
                        <Circle size={18} className='text-amber-700' />
                      )}
                      {!store.tier && (
                        <Circle size={18} className='text-gray-400' />
                      )}
                    </span>
                    <span
                      className={`text-base font-medium ${
                        !store.tier
                          ? 'text-gray-500'
                          : store.tier === 'gold+'
                            ? 'text-yellow-700'
                            : store.tier === 'gold'
                              ? 'text-yellow-600'
                              : store.tier === 'silver'
                                ? 'text-gray-600'
                                : store.tier === 'bronze'
                                  ? 'text-amber-700'
                                  : 'text-gray-500'
                      }`}
                    >
                      {store.tier?.toUpperCase() || 'Sconosciuto'}
                    </span>
                  </div>
                </div>
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
                options={filteredStatuses}
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
