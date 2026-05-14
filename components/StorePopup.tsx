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
  XCircle,
  FileX,
  Camera,
  ExternalLink,
} from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

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
import { WorkflowRunner } from './WorkflowRunner';

import { StorePopupProps, ClientWorkflow } from '@/types';
import { getStatusLabel, statuses, StatusItem } from '@/utils/utils';
import { getClientLogoUrl } from '@/utils/client-logo';
import { parseCoords } from '@/utils/navigation';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';

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
    case 'x-circle':
      return <XCircle size={16} className='text-gray-600' />;
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [uploadingGenericPhoto, setUploadingGenericPhoto] = useState(false);
  const [genericPhotoUploaded, setGenericPhotoUploaded] = useState(false);
  const [showGenericCamera, setShowGenericCamera] = useState(false);
  const [genericStream, setGenericStream] = useState<MediaStream | null>(null);
  const genericVideoRef = useRef<HTMLVideoElement>(null);

  // Workflow (Amex-specific or other client-specific flows)
  const [clientWorkflow, setClientWorkflow] = useState<ClientWorkflow | null>(null);
  const [nonExistentReason, setNonExistentReason] = useState('');
  const [nonExistentText, setNonExistentText] = useState('');
  const [existingOutcome, setExistingOutcome] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  const supabase = createClient();

  const storeCoordinates: [number, number] | null = parseCoords(store.location);
  const clientLogoUrl = getClientLogoUrl(store.client_logo);
  // Create a modified statuses array with actual icon elements
  const statusesWithIcons = statuses.map((status) => ({
    label: status.label,
    value: status.value,
    icon: getIconByType(status.iconType),
  }));

  // Statuses hidden per workflow (e.g. Amex hides 'not_interested')
  const hiddenStatuses = clientWorkflow ? ['not_interested'] : [];

  const filteredStatuses = (
    storeStatuses[store.id] === 'in_progress' || store.status === 'in_progress'
      ? statusesWithIcons.filter((s) => s.value !== 'free')
      : statusesWithIcons
  ).filter((s) => !hiddenStatuses.includes(s.value));

  // Use workflow-specific reasons for 'failed' if available, otherwise use default
  const notesOptions = clientWorkflow?.failed_reasons
    ? clientWorkflow.failed_reasons.map((r) => ({
        label: r.label,
        value: r.value,
        icon: <Ban size={16} className='text-red-500' />,
      }))
    : [
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
          label: 'Non contrattualizzabile',
          value: 'non contrattualizzabile',
          icon: <FileX size={16} className='text-red-500' />,
        },
        {
          label: 'Altro',
          value: 'altro',
          icon: <AlertCircle size={16} className='text-gray-500' />,
        },
      ];

  // non_existent reasons from workflow (if available)
  const nonExistentReasonOptions = clientWorkflow?.non_existent_reasons?.map((r) => ({
    label: r.label,
    value: r.value,
    icon: <XCircle size={16} className='text-gray-400' />,
  })) ?? null;

  const selectedNonExistentReasonDef = clientWorkflow?.non_existent_reasons?.find(
    (r) => r.value === nonExistentReason
  ) ?? null;

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

  // Reset pagination and workflow state when store changes
  useEffect(() => {
    setLogsOffset(0);
    setHasMoreLogs(true);
    setPhotoUploaded(false);
    setNonExistentReason('');
    setNonExistentText('');
    setExistingOutcome(null);
  }, [store.id]);

  // Fetch client workflow and any existing outcome for this store
  useEffect(() => {
    const fetchWorkflow = async () => {
      if (!store.client_id) { setClientWorkflow(null); return; }
      const { data } = await supabase
        .from('client_workflows')
        .select('workflow')
        .eq('client_id', store.client_id)
        .eq('active', true)
        .single();
      setClientWorkflow(data ? (data.workflow as ClientWorkflow) : null);
    };

    const fetchOutcome = async () => {
      if (!store.client_id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data } = await supabase
        .from('store_visit_outcomes')
        .select('outcome_data')
        .eq('store_id', store.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setExistingOutcome(data.outcome_data);
    };

    fetchWorkflow();
    fetchOutcome();
  }, [store.id, store.client_id]);

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

  // Function to upload photo file
  const uploadPhotoFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Per favore seleziona un file immagine');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Il file è troppo grande. Dimensione massima: 5MB');
      return;
    }

    setUploadingPhoto(true);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Utente non autenticato');
      }

      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${store.id}_${user.id}_${timestamp}_${randomString}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('store-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('store-photos')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Impossibile ottenere l\'URL pubblico della foto');
      }

      // Insert record in database
      const { error: insertError } = await supabase
        .from('store_photos')
        .insert({
          store_id: store.id,
          user_id: user.id,
          photo_url: urlData.publicUrl,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }

      // Show success state instead of alert
      // Keep it green until page refresh
      setPhotoUploaded(true);
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      alert(`Errore durante il caricamento: ${error.message || 'Errore sconosciuto'}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Function to handle photo upload from file input
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadPhotoFile(file);
    // Reset input
    event.target.value = '';
  };

  // Function to open camera
  const openCamera = async () => {
    try {
      // Try to access camera using getUserMedia
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Prefer rear camera on mobile
        audio: false,
      });
      setStream(mediaStream);
      setShowCamera(true);
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      // Fallback to file input if camera access fails
      document.getElementById(`photo-upload-${store.id}`)?.click();
    }
  };

  // Function to capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Stop camera stream
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
          setShowCamera(false);

          // Create File from blob
          const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
          await uploadPhotoFile(file);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  // Function to close camera
  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  // Setup video stream when camera opens
  useEffect(() => {
    if (showCamera && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [showCamera, stream]);

  // Function to upload generic photo file
  const uploadGenericPhotoFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Per favore seleziona un file immagine');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Il file è troppo grande. Dimensione massima: 5MB');
      return;
    }

    setUploadingGenericPhoto(true);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Utente non autenticato');
      }

      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${store.id}_${user.id}_${timestamp}_${randomString}.${fileExt}`;

      // Upload to Supabase Storage - generic-photos bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('generic-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('generic-photos')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Impossibile ottenere l\'URL pubblico della foto');
      }

      // Insert record in database - generic_photos table
      const { error: insertError } = await supabase
        .from('generic_photos')
        .insert({
          store_id: store.id,
          user_id: user.id,
          photo_url: urlData.publicUrl,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }

      // Show success state instead of alert
      setGenericPhotoUploaded(true);
      
      // Reset success state after 3 seconds
      setTimeout(() => {
        setGenericPhotoUploaded(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error uploading generic photo:', error);
      alert(`Errore durante il caricamento: ${error.message || 'Errore sconosciuto'}`);
    } finally {
      setUploadingGenericPhoto(false);
    }
  };

  // Function to open generic camera
  const openGenericCamera = async () => {
    try {
      // Try to access camera using getUserMedia
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Prefer rear camera on mobile
        audio: false,
      });
      setGenericStream(mediaStream);
      setShowGenericCamera(true);
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      // Fallback to file input if camera access fails
      document.getElementById(`generic-photo-upload-${store.id}`)?.click();
    }
  };

  // Function to capture generic photo from camera
  const captureGenericPhoto = () => {
    if (!genericVideoRef.current || !genericStream) return;

    const video = genericVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Stop camera stream
          genericStream.getTracks().forEach(track => track.stop());
          setGenericStream(null);
          setShowGenericCamera(false);

          // Create File from blob
          const file = new File([blob], `generic-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
          await uploadGenericPhotoFile(file);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  // Function to close generic camera
  const closeGenericCamera = () => {
    if (genericStream) {
      genericStream.getTracks().forEach(track => track.stop());
      setGenericStream(null);
    }
    setShowGenericCamera(false);
  };

  // Setup generic video stream when camera opens
  useEffect(() => {
    if (showGenericCamera && genericVideoRef.current && genericStream) {
      genericVideoRef.current.srcObject = genericStream;
    }
  }, [showGenericCamera, genericStream]);

  return (
    <div>
      <div className='flex items-center'>
        <div
          className={`w-[48px] h-[48px] rounded-full flex items-center justify-center text-white font-medium text-lg flex-shrink-0 overflow-hidden
          ${
            clientLogoUrl
              ? 'bg-gray-100 p-0'
              : store.category.toLowerCase().includes('formazione')
                ? 'bg-blue-600'
                : store.category.toLowerCase().includes('commercio')
                  ? 'bg-slate-600'
                  : store.category.toLowerCase().includes('ristora')
                    ? 'bg-red-600'
                    : store.category.toLowerCase().includes('negozio')
                      ? 'bg-indigo-600'
                      : store.category.toLowerCase().includes('farmacia')
                        ? 'bg-green-600'
                        : store.category.toLowerCase().includes('ottic')
                          ? 'bg-slate-600'
                          : store.tier === 'gold+'
                            ? 'bg-yellow-600'
                            : store.tier === 'gold'
                              ? 'bg-yellow-600'
                              : store.tier === 'silver'
                                ? 'bg-slate-600'
                                : store.tier === 'bronze'
                                  ? 'bg-amber-700'
                                  : 'bg-slate-600'
          }`}
        >
          {clientLogoUrl ? (
            <img
              src={clientLogoUrl}
              alt=''
              width={48}
              height={48}
              className='w-full h-full object-cover'
            />
          ) : (
            <span>{store.name.substring(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className='ml-3 flex-1 min-w-0 overflow-hidden'>
          <div className='space-y-0 flex flex-col'>
            <h3 className='text-base font-medium text-gray-800 truncate leading-none'>
              {store.name}
            </h3>
            <p className='text-sm text-gray-500 truncate leading-none pt-1'>
              {store.category.charAt(0).toUpperCase() + store.category.slice(1)}
            </p>
            <p className='text-xs text-gray-400 truncate leading-none pt-2'>
              {store.address}
            </p>
            {store.client_name ? (
              <div className='flex items-center gap-1.5 pt-1.5'>
                {clientLogoUrl ? (
                  <span className='relative w-3.5 h-3.5 rounded-full overflow-hidden flex-shrink-0 bg-gray-200'>
                    <img
                      src={clientLogoUrl}
                      alt=''
                      width={14}
                      height={14}
                      className='w-full h-full object-cover'
                    />
                  </span>
                ) : null}
                <span className='text-xs text-gray-500 truncate'>{store.client_name}</span>
              </div>
            ) : null}
          </div>

          {(store.tier || store.fatturato) && (
            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
              {store.tier && (
                <>
                  {getTierIcon(store.tier)}
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      store.tier === 'gold+'
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
                    {store.tier.toUpperCase()}
                  </span>
                </>
              )}

              {store.fatturato && (
                <>
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
          )}
        </div>
      </div>

      <div className='flex flex-col gap-2 mt-4'>
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
          <SheetTrigger asChild>
            <Button
              variant='secondary'
              className='w-full bg-[#1B304E] hover:bg-[#224677] text-white'
              onClick={() => {
                setLogsOffset(0);
                setHasMoreLogs(true);
                fetchStatusLogs(store.id, 0);
              }}
            >
              <Settings className='mr-2' /> Gestisci
            </Button>
          </SheetTrigger>
          <SheetContent className='z-1000 flex flex-col h-screen overflow-y-auto p-4' style={{ backgroundColor: '#224677' }}>
            <SheetHeader>
              <SheetTitle className='text-xl font-bold text-white'>
                Info punto vendita
              </SheetTitle>
              <SheetDescription className='text-white/80'>
                Qui trovi i dettagli dell'attività.
              </SheetDescription>
            </SheetHeader>

            <div className='py-4'>
              <div className='py-3 border-b border-white/20 flex items-center gap-3'>
                {clientLogoUrl ? (
                  <span className='relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-white/20'>
                    <img
                      src={clientLogoUrl}
                      alt=''
                      width={48}
                      height={48}
                      className='w-full h-full object-cover'
                    />
                  </span>
                ) : null}
                <div>
                  <strong className='text-lg font-semibold text-white'>{store.name}</strong>
                  {store.client_name ? (
                    <p className='text-sm text-white/80 mt-0.5 flex items-center gap-2'>
                      {clientLogoUrl ? (
                        <span className='relative w-4 h-4 rounded-full overflow-hidden flex-shrink-0 inline-block bg-white/20'>
                          <img
                            src={clientLogoUrl}
                            alt=''
                            width={16}
                            height={16}
                            className='w-full h-full object-cover'
                          />
                        </span>
                      ) : null}
                      {store.client_name}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className='py-3 border-b border-white/20'>
                <p className='text-base text-white/80 font-medium'>
                  Categoria:
                </p>
                <p className='text-base text-white'>{store.category}</p>
              </div>
              {store.pi ? (
                <div className='py-3 border-b border-white/20'>
                  <p className='text-base text-white/80 font-medium'>Partita IVA:</p>
                  <p className='text-base text-white'>{store.pi}</p>
                </div>
              ) : null}
              {(store.tier || store.fatturato) && (
                <div className='py-3 border-b border-white/20'>
                  <p className='text-base text-white/80 font-medium'>
                    Fatturato:
                  </p>
                  <div className='mt-2 flex flex-row items-center gap-3'>
                    {/* Tier Badge – solo se presente */}
                    {store.tier && (
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md flex-shrink-0 ${
                          store.tier === 'gold+'
                            ? 'bg-yellow-500/30 border border-yellow-400/50'
                            : store.tier === 'gold'
                              ? 'bg-yellow-400/30 border border-yellow-300/50'
                              : store.tier === 'silver'
                                ? 'bg-gray-300/30 border border-gray-200/50'
                                : store.tier === 'bronze'
                                  ? 'bg-amber-500/30 border border-amber-400/50'
                                  : 'bg-white/20 border border-white/30'
                        }`}
                      >
                        <span className='mr-1'>
                          {store.tier === 'gold+' && <Trophy size={18} className='text-yellow-300' />}
                          {store.tier === 'gold'  && <Award  size={18} className='text-yellow-200' />}
                          {store.tier === 'silver' && <Medal  size={18} className='text-gray-200'  />}
                          {store.tier === 'bronze' && <Circle size={18} className='text-amber-300' />}
                        </span>
                        <span
                          className={`text-base font-medium ${
                            store.tier === 'gold+'  ? 'text-yellow-200'
                            : store.tier === 'gold'   ? 'text-yellow-100'
                            : store.tier === 'silver' ? 'text-gray-100'
                            : store.tier === 'bronze' ? 'text-amber-200'
                            : 'text-white/80'
                          }`}
                        >
                          {store.tier.toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Fatturato Amount */}
                    {store.fatturato && (
                      <div className='px-3 py-1.5 bg-green-500/30 rounded-md border border-green-400/50 flex items-center flex-1'>
                        <CreditCard className='h-5 w-5 text-green-200 mr-2 flex-shrink-0' />
                        <p className='text-base font-semibold text-green-100'>
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
              )}
              <div className='py-3'>
                <p className='text-base text-white/80 font-medium'>
                  Indirizzo:
                </p>
                <p className='text-base text-white'>{store.address}</p>
              </div>
            </div>

            <div className='flex flex-col gap-3 mb-4'>
              {/* Photo Upload Button */}
              <input
                type='file'
                accept='image/*'
                capture='environment'
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                className='hidden'
                id={`photo-upload-${store.id}`}
              />
              <Button
                type='button'
                variant='outline'
                className={cn(
                  'w-full transition-all duration-300 bg-white text-[#224677] border-white hover:bg-gray-100',
                  photoUploaded && 'bg-green-500 text-white border-green-600 cursor-default hover:bg-green-500'
                )}
                disabled={uploadingPhoto || photoUploaded}
                onClick={openCamera}
              >
                {uploadingPhoto ? (
                  <>
                    <Loader className='mr-2 h-4 w-4 animate-spin' />
                    Caricamento...
                  </>
                ) : photoUploaded ? (
                  <>
                    <CheckCircle className='mr-2 h-4 w-4' />
                    Foto caricata!
                  </>
                ) : (
                  <>
                    <Camera className='mr-2' />
                    Mi trovo qui
                  </>
                )}
              </Button>

              {/* Camera Modal */}
              {showCamera && (
                <div className='fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center'>
                  <div className='relative w-full max-w-2xl mx-4'>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className='w-full rounded-lg'
                      style={{ transform: 'scaleX(-1)' }} // Mirror effect
                    />
                    <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4'>
                      <Button
                        onClick={closeCamera}
                        variant='destructive'
                        size='lg'
                        className='rounded-full h-16 w-16'
                      >
                        <X className='h-6 w-6' />
                      </Button>
                      <Button
                        onClick={capturePhoto}
                        size='lg'
                        className='rounded-full h-16 w-16 bg-white hover:bg-gray-200 flex items-center justify-center'
                      >
                        <Camera className='h-8 w-8 text-gray-800' />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* DOM link (Amex) – sbloccato dopo la foto */}
              {clientWorkflow?.dom_link && (
                <a
                  href={photoUploaded ? clientWorkflow.dom_link : undefined}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={cn(
                    'flex items-center justify-center gap-2 w-full py-2 px-4 rounded-md text-sm font-medium transition-colors',
                    photoUploaded
                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                      : 'bg-white/10 text-white/40 cursor-not-allowed pointer-events-none border border-white/20'
                  )}
                >
                  <ExternalLink className='h-4 w-4' />
                  Apri piattaforma DOM
                  {!photoUploaded && <span className='text-xs ml-1'>(sblocca con foto)</span>}
                </a>
              )}

              {/* Avviso visivo: la select è bloccata finché non si carica la foto */}
              {!photoUploaded &&
                ![
                  'concluded',
                  'already_client',
                  'failed',
                  'not_interested',
                  'non_existent',
                ].includes(storeStatuses[store.id] || store.status) && (
                  <div className='flex items-center gap-2 px-3 py-2 rounded-md bg-amber-400/20 border border-amber-400/50'>
                    <Camera className='h-4 w-4 text-amber-300 flex-shrink-0' />
                    <p className='text-xs text-amber-200 leading-tight'>
                      Scatta prima la foto <strong>"Mi trovo qui"</strong> per cambiare stato
                    </p>
                  </div>
                )}

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
                  !photoUploaded ||
                  [
                    'concluded',
                    'already_client',
                    'failed',
                    'not_interested',
                    'non_existent',
                  ].includes(storeStatuses[store.id] || store.status)
                }
              />

              {/* Notes select for 'failed' (Bad prospect) */}
              {(storeStatuses[store.id] === 'failed' ||
                store.status === 'failed') && (
                <SelectComponent
                  placeholder='Motivo'
                  value={selectedNote}
                  onChange={(note) => {
                    if (note) {
                      setSelectedNote(note);
                      handleStatusChangeAttempt(store.id, 'failed', note);
                    }
                  }}
                  options={notesOptions}
                  disabled={
                    !!loadingStatus[store.id] ||
                    ['concluded', 'already_client', 'not_interested', 'non_existent'].includes(
                      storeStatuses[store.id] || store.status
                    )
                  }
                />
              )}

              {/* non_existent reasons (workflow-driven, e.g. Amex) */}
              {nonExistentReasonOptions &&
                (storeStatuses[store.id] === 'non_existent' || store.status === 'non_existent') && (
                  <div className='space-y-2'>
                    <SelectComponent
                      placeholder='Motivo inesistenza'
                      value={nonExistentReason}
                      onChange={(v) => {
                        if (v) {
                          setNonExistentReason(v);
                          setNonExistentText('');
                        }
                      }}
                      options={nonExistentReasonOptions}
                      disabled={!!loadingStatus[store.id]}
                    />
                    {selectedNonExistentReasonDef?.freeText && (
                      <div className='flex gap-2'>
                        <input
                          type='text'
                          placeholder={selectedNonExistentReasonDef.freeTextLabel ?? 'Note'}
                          value={nonExistentText}
                          onChange={(e) => setNonExistentText(e.target.value)}
                          className='flex-1 px-3 py-2 rounded-md text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/50'
                        />
                        <Button
                          type='button'
                          size='sm'
                          className='bg-white text-[#224677] hover:bg-gray-100'
                          disabled={!nonExistentText.trim() || !!loadingStatus[store.id]}
                          onClick={() => {
                            const note = `${selectedNonExistentReasonDef.label}: ${nonExistentText.trim()}`;
                            handleStatusChangeAttempt(store.id, 'non_existent', note);
                          }}
                        >
                          Salva
                        </Button>
                      </div>
                    )}
                    {nonExistentReason && !selectedNonExistentReasonDef?.freeText && (
                      <Button
                        type='button'
                        size='sm'
                        className='w-full bg-white text-[#224677] hover:bg-gray-100'
                        disabled={!!loadingStatus[store.id]}
                        onClick={() =>
                          handleStatusChangeAttempt(
                            store.id,
                            'non_existent',
                            selectedNonExistentReasonDef?.label ?? nonExistentReason
                          )
                        }
                      >
                        Salva motivo
                      </Button>
                    )}
                  </div>
                )}

              {/* Generic Photo Upload Button */}
              <input
                type='file'
                accept='image/*'
                capture='environment'
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  await uploadGenericPhotoFile(file);
                  event.target.value = '';
                }}
                disabled={uploadingGenericPhoto}
                className='hidden'
                id={`generic-photo-upload-${store.id}`}
              />
              <Button
                type='button'
                variant='outline'
                className={cn(
                  'w-full transition-all duration-300 bg-white text-[#224677] border-white hover:bg-gray-100',
                  genericPhotoUploaded && 'bg-green-500 hover:bg-green-600 text-white border-green-600'
                )}
                disabled={uploadingGenericPhoto}
                onClick={openGenericCamera}
              >
                {uploadingGenericPhoto ? (
                  <>
                    <Loader className='mr-2 h-4 w-4 animate-spin' />
                    Caricamento...
                  </>
                ) : genericPhotoUploaded ? (
                  <>
                    <CheckCircle className='mr-2 h-4 w-4' />
                    Foto caricata!
                  </>
                ) : (
                  <>
                    <Camera className='mr-2' />
                    Foto generica
                  </>
                )}
              </Button>

              {/* Generic Camera Modal */}
              {showGenericCamera && (
                <div className='fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center'>
                  <div className='relative w-full max-w-2xl mx-4'>
                    <video
                      ref={genericVideoRef}
                      autoPlay
                      playsInline
                      className='w-full rounded-lg'
                      style={{ transform: 'scaleX(-1)' }} // Mirror effect
                    />
                    <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4'>
                      <Button
                        onClick={closeGenericCamera}
                        variant='destructive'
                        size='lg'
                        className='rounded-full h-16 w-16'
                      >
                        <X className='h-6 w-6' />
                      </Button>
                      <Button
                        onClick={captureGenericPhoto}
                        size='lg'
                        className='rounded-full h-16 w-16 bg-white hover:bg-gray-200 flex items-center justify-center'
                      >
                        <Camera className='h-8 w-8 text-gray-800' />
                      </Button>
                    </div>
                  </div>
                </div>
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

            {storeStatuses[store.id] === 'concluded' &&
              (clientWorkflow?.concluded_sub_workflow?.sections?.length ? (
                <WorkflowRunner
                  storeId={store.id}
                  clientId={store.client_id!}
                  userId={currentUserId}
                  workflow={clientWorkflow}
                  variant='concluded'
                  existingOutcome={existingOutcome}
                />
              ) : storeStatuses[store.id] === 'concluded' ? (
                <Button
                  onClick={() =>
                    window.open('https://appraise.attitudeltd.com/ff_acquiring', '_blank')
                  }
                >
                  <FileCheck className='mr-2' /> Compila distinta
                </Button>
              ) : null)}

            {storeStatuses[store.id] === 'already_client' &&
              clientWorkflow &&
              (clientWorkflow.already_client_sub_workflow?.sections?.length ?? 0) > 0 && (
                <WorkflowRunner
                  storeId={store.id}
                  clientId={store.client_id!}
                  userId={currentUserId}
                  workflow={clientWorkflow}
                  variant='already_client'
                  existingOutcome={existingOutcome}
                />
              )}

            {statusLogs[store.id]?.length > 0 && (
              <div className='py-3'>
                <p className='text-lg font-medium text-white mb-3 border-b border-white/20 pb-2'>
                  Storico Modifiche
                </p>
                {statusLogs[store.id]?.map((log) => (
                  <div
                    key={log.id}
                    className='mb-3 p-3 bg-white/10 rounded-lg shadow-md border border-white/20'
                  >
                    <p className='text-sm text-white/80 mb-1'>
                      <strong>Data:</strong>{' '}
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                    {log.modifierName && (
                      <p className='text-sm text-white/80 mb-1'>
                        <strong>Modificato da:</strong>{' '}
                        <span className='text-white'>
                          {log.modifierName}
                        </span>
                      </p>
                    )}
                    <p className='text-sm text-white/80'>
                      <strong>Nuovo Stato:</strong>{' '}
                      <span className='text-white inline-flex items-center'>
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
                    className='w-full mt-2 text-white border-white/20 hover:bg-white/20 bg-white/10'
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
