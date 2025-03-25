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
  CreditCard,
  Store as StoreIcon,
  AlertCircle,
  Check,
  Clock,
  Ban,
  X,
  Star,
  Plus,
  CheckCircle,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

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
import { getStatusLabel, statuses, StatusItem } from '@/utils/utils';
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

// Helper function to render icon based on iconType
const getIconByType = (iconType: string) => {
  switch (iconType) {
    case 'plus':
      return <Plus size={16} className='text-blue-700' />;
    case 'clock':
      return <Clock size={16} className='text-amber-500' />;
    case 'check-circle':
      return <CheckCircle size={16} className='text-emerald-600' />;
    case 'star':
      return <Star size={16} className='text-emerald-600' />;
    case 'ban':
      return <Ban size={16} className='text-red-600' />;
    case 'x':
      return <X size={16} className='text-red-600' />;
    default:
      return null;
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
  const [selectedNote, setSelectedNote] = useState('');
  const [logsOffset, setLogsOffset] = useState(0);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [checkingInProgressLimit, setCheckingInProgressLimit] = useState(false);

  const storeCoordinates: [number, number] | null = parseCoords(store.location);
  // Create a modified statuses array with actual icon elements
  const statusesWithIcons = statuses.map((status) => ({
    label: status.label,
    value: status.value,
    icon: getIconByType(status.iconType),
  }));

  const filteredStatuses =
    storeStatuses[store.id] === 'in_progress' || store.status === 'in_progress'
      ? statusesWithIcons.filter((status) => status.value !== 'free')
      : statusesWithIcons;

  const notesOptions = [
    {
      label: 'Fatturato errato',
      value: 'fatturato errato',
      icon: <CreditCard size={16} className='text-amber-500' />,
    },
    {
      label: 'Tipologia errata',
      value: 'tipologia errata',
      icon: <StoreIcon size={16} className='text-purple-500' />,
    },
    {
      label: 'Altro',
      value: 'altro',
      icon: <AlertCircle size={16} className='text-gray-500' />,
    },
  ];

  // Function to handle loading more logs
  const handleLoadMoreLogs = async () => {
    setLoadingMoreLogs(true);
    const newOffset = logsOffset + 3;
    const logsCount = await fetchStatusLogs(store.id, newOffset);
    setLogsOffset(newOffset);

    // If no logs or less than 3 logs were returned, there are no more logs to load
    if (!logsCount || logsCount < 3) {
      setHasMoreLogs(false);
    }

    setLoadingMoreLogs(false);
  };

  // Reset pagination when store changes
  useEffect(() => {
    setLogsOffset(0);
    setHasMoreLogs(true);
  }, [store.id]);

  // Function to get current user position
  const getUserPosition = () => {
    return new Promise<[number, number]>((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve([position.coords.latitude, position.coords.longitude]);
          },
          (error) => {
            console.error('Error getting user position:', error);
            reject(error);
          }
        );
      } else {
        const error = new Error('Geolocation not supported by this browser');
        console.error(error);
        reject(error);
      }
    });
  };

  return (
    <div>
      <div className='flex items-center'>
        <div
          className={`w-[50px] h-[50px] rounded-full shadow-md flex items-center justify-center text-white font-bold text-xl
          ${
            store.category.toLowerCase().includes('ristora')
              ? 'bg-red-500'
              : store.category.toLowerCase().includes('negozio')
                ? 'bg-blue-500'
                : store.category.toLowerCase().includes('farmacia')
                  ? 'bg-green-500'
                  : store.category.toLowerCase().includes('abbigliamento')
                    ? 'bg-purple-500'
                    : store.category.toLowerCase().includes('alimentari')
                      ? 'bg-orange-500'
                      : store.tier === 'gold+'
                        ? 'bg-yellow-500'
                        : store.tier === 'gold'
                          ? 'bg-yellow-400'
                          : store.tier === 'silver'
                            ? 'bg-gray-400'
                            : store.tier === 'bronze'
                              ? 'bg-amber-700'
                              : 'bg-gray-500'
          }`}
        >
          {store.name.substring(0, 1).toUpperCase()}
        </div>
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

              {/* Add fatturato badge right next to tier badge */}
              {store.fatturato && (
                <>
                  <div className='w-1'></div>
                  <CreditCard size={14} className='text-green-600' />
                  <span className='text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-800 border border-green-200'>
                    {typeof store.fatturato === 'number'
                      ? `€ ${store.fatturato.toLocaleString('it-IT')}`
                      : store.fatturato.toString().startsWith('€')
                        ? store.fatturato
                        : `€ ${store.fatturato}`}
                  </span>
                </>
              )}
            </div>
          </p>
        </div>
      </div>

      <div className='flex flex-col gap-2 mt-2'>
        <Button
          variant='secondary'
          className='w-full bg-[#1B304E] hover:bg-[#224677] text-white'
          onClick={async () => {
            if (storeCoordinates) {
              try {
                // Get current user position
                const userCoords = await getUserPosition();

                // Check if the device is iOS
                const isIOS =
                  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                  !(window as any).MSStream;

                // Check if the device is Android
                const isAndroid = /Android/.test(navigator.userAgent);

                if (isIOS) {
                  // First try to open in Google Maps app if installed
                  const googleMapsIOSUrl = `comgooglemaps://?saddr=${userCoords[0]},${userCoords[1]}&daddr=${storeCoordinates[0]},${storeCoordinates[1]}&directionsmode=driving`;

                  // Fallback to Apple Maps if Google Maps isn't installed
                  const appleMapsUrl = `maps://maps.apple.com/?saddr=${userCoords[0]},${userCoords[1]}&daddr=${storeCoordinates[0]},${storeCoordinates[1]}&dirflg=d`;

                  // Try to open Google Maps first with a timeout
                  window.location.href = googleMapsIOSUrl;

                  // If Google Maps doesn't open within 2 seconds, try Apple Maps
                  setTimeout(() => {
                    window.location.href = appleMapsUrl;
                  }, 2000);
                } else if (isAndroid) {
                  // For Android, use intent URL to open native Google Maps app
                  const androidGoogleMapsUrl = `google.navigation:q=${storeCoordinates[0]},${storeCoordinates[1]}&mode=d`;

                  // Alternative with origin
                  const androidGoogleMapsUrlWithOrigin = `https://www.google.com/maps/dir/?api=1&origin=${userCoords[0]},${userCoords[1]}&destination=${storeCoordinates[0]},${storeCoordinates[1]}&travelmode=driving&dir_action=navigate`;

                  // Try native app URL first
                  window.location.href = androidGoogleMapsUrl;

                  // Fallback to the web URL that will prompt to open in app
                  setTimeout(() => {
                    window.location.href = androidGoogleMapsUrlWithOrigin;
                  }, 1000);
                } else {
                  // For non-mobile devices, use web URL
                  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userCoords[0]},${userCoords[1]}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
                  window.open(gmapsUrl, '_blank');
                }
              } catch (error) {
                // Fallback to using provided coordinates if geolocation fails
                const isIOS =
                  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                  !(window as any).MSStream;

                // Check if the device is Android
                const isAndroid = /Android/.test(navigator.userAgent);

                if (isIOS) {
                  // Just use the destination coordinates for iOS
                  const googleMapsIOSUrl = `comgooglemaps://?daddr=${storeCoordinates[0]},${storeCoordinates[1]}&directionsmode=driving`;
                  const appleMapsUrl = `maps://maps.apple.com/?daddr=${storeCoordinates[0]},${storeCoordinates[1]}&dirflg=d`;

                  window.location.href = googleMapsIOSUrl;
                  setTimeout(() => {
                    window.location.href = appleMapsUrl;
                  }, 2000);
                } else if (isAndroid) {
                  // For Android without user coordinates
                  const androidGoogleMapsUrl = `google.navigation:q=${storeCoordinates[0]},${storeCoordinates[1]}&mode=d`;

                  // Fallback with web URL that will prompt to open in app
                  const androidGoogleMapsWebUrl = `https://www.google.com/maps/search/?api=1&query=${storeCoordinates[0]},${storeCoordinates[1]}`;

                  window.location.href = androidGoogleMapsUrl;
                  setTimeout(() => {
                    window.location.href = androidGoogleMapsWebUrl;
                  }, 1000);
                } else {
                  // For non-mobile, fall back to original behavior
                  if (Array.isArray(coord) && coord.length === 2) {
                    const [lat, lng] = coord;
                    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${storeCoordinates[0]},${storeCoordinates[1]}`;
                    window.open(gmapsUrl, '_blank');
                  } else {
                    // Just open the destination if we don't have user coordinates
                    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${storeCoordinates[0]},${storeCoordinates[1]}`;
                    window.open(gmapsUrl, '_blank');
                  }
                }
              }
            }
          }}
        >
          <Navigation className='mr-2' /> Indicazioni
        </Button>

        <Button
          variant='secondary'
          className={`w-full ${!store.phone ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#1B304E] hover:bg-[#224677]'} text-white`}
          onClick={() => {
            if (store.phone) {
              window.open(`tel:${store.phone}`, '_self');
            }
          }}
          disabled={!store.phone}
          title={
            !store.phone
              ? 'Numero di telefono non disponibile'
              : `Chiama ${store.phone}`
          }
        >
          <Phone className='mr-2' /> Chiama
        </Button>

        <Sheet>
          <SheetTrigger
            onClick={() => {
              setLogsOffset(0);
              setHasMoreLogs(true);
              fetchStatusLogs(store.id, 0);
            }}
          >
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
                <p className='text-base text-gray-400 font-medium'>
                  Fatturato:
                </p>
                <div className='mt-2 flex flex-row items-center gap-3'>
                  {/* Tier Badge */}
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md flex-shrink-0 ${
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

                  {/* Fatturato Amount */}
                  {store.fatturato && (
                    <div className='px-3 py-1.5 bg-green-50 rounded-md border border-green-100 flex items-center flex-1'>
                      <CreditCard className='h-5 w-5 text-green-600 mr-2 flex-shrink-0' />
                      <p className='text-base font-semibold text-green-800'>
                        {typeof store.fatturato === 'number'
                          ? `€ ${store.fatturato.toLocaleString('it-IT')}`
                          : store.fatturato.toString().startsWith('€')
                            ? store.fatturato
                            : `€ ${store.fatturato}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className='py-3'>
                <p className='text-base text-gray-400 font-medium'>
                  Indirizzo:
                </p>
                <p className='text-base text-gray-600'>{store.address}</p>
              </div>
            </div>

            <div className='flex flex-col gap-3 mb-4'>
              <SelectComponent
                placeholder='Stato avanzamento'
                value={storeStatuses[store.id] || store.status}
                onChange={async (newStatus) => {
                  if (newStatus) {
                    // Reset selected note when status changes
                    setSelectedNote('');

                    // If changing to in_progress, apply special handling
                    if (
                      newStatus === 'in_progress' &&
                      storeStatuses[store.id] !== 'in_progress' &&
                      store.status !== 'in_progress'
                    ) {
                      // Set local loading state
                      setCheckingInProgressLimit(true);

                      // Pass special parameter to parent component for in_progress validation
                      const success = await handleStatusChangeAttempt(
                        store.id,
                        newStatus,
                        selectedNote,
                        true
                      );

                      setCheckingInProgressLimit(false);

                      // If status change failed, we don't need to do anything else
                      if (!success) return;
                    } else {
                      // For other statuses, proceed normally
                      handleStatusChangeAttempt(
                        store.id,
                        newStatus,
                        selectedNote
                      );
                    }
                  }
                }}
                options={filteredStatuses}
                disabled={
                  !!loadingStatus[store.id] ||
                  checkingInProgressLimit ||
                  [
                    'concluded',
                    'already_client',
                    'failed',
                    'not_interested',
                  ].includes(storeStatuses[store.id] || store.status)
                }
              />

              {/* Show notes select only when status is 'failed' (Bad prospect) */}
              {(storeStatuses[store.id] === 'failed' ||
                store.status === 'failed') && (
                <SelectComponent
                  placeholder='Motivo'
                  value={selectedNote}
                  onChange={(note) => {
                    if (note) {
                      setSelectedNote(note);
                      // Update with the new note
                      handleStatusChangeAttempt(store.id, 'failed', note);
                    }
                  }}
                  options={notesOptions}
                  disabled={
                    !!loadingStatus[store.id] ||
                    ['concluded', 'already_client', 'not_interested'].includes(
                      storeStatuses[store.id] || store.status
                    )
                  }
                />
              )}
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
                  window.open(
                    'https://appraise.attitudeltd.com/ff_acquiring',
                    '_blank'
                  )
                }
              >
                <FileCheck className='mr-2' /> Compila distinta
              </Button>
            )}

            {statusLogs[store.id]?.length > 0 && (
              <div className='py-3'>
                <p className='text-lg font-medium text-gray-300 mb-3 border-b border-gray-600 pb-2'>
                  Storico Modifiche
                </p>
                {statusLogs[store.id]?.map((log) => (
                  <div
                    key={log.id}
                    className='mb-3 p-3 bg-gray-800 rounded-lg shadow-md border border-gray-700'
                  >
                    <p className='text-sm text-gray-400 mb-1'>
                      <strong>Data:</strong>{' '}
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                    {log.modifierName && (
                      <p className='text-sm text-gray-400 mb-1'>
                        <strong>Modificato da:</strong>{' '}
                        <span className='text-gray-200'>
                          {log.modifierName}
                        </span>
                      </p>
                    )}
                    <p className='text-sm text-gray-400'>
                      <strong>Nuovo Stato:</strong>{' '}
                      <span className='text-gray-200 inline-flex items-center'>
                        {statuses.find((s) => s.value === log.new) && (
                          <span className='mr-1'>
                            {getIconByType(
                              statuses.find((s) => s.value === log.new)
                                ?.iconType || ''
                            )}
                          </span>
                        )}
                        {getStatusLabel(log.new)}
                      </span>
                    </p>
                  </div>
                ))}

                {hasMoreLogs && (
                  <Button
                    variant='outline'
                    className='w-full mt-2 text-gray-300 border-gray-600 hover:bg-gray-700'
                    onClick={handleLoadMoreLogs}
                    disabled={loadingMoreLogs}
                  >
                    {loadingMoreLogs ? (
                      <>
                        <Loader className='mr-2 h-4 w-4 animate-spin' />
                        Caricamento...
                      </>
                    ) : (
                      'Carica altre modifiche'
                    )}
                  </Button>
                )}
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
