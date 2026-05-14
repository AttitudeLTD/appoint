'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Plus } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Avatar } from './ui/avatar';
import { Checkbox } from './ui/checkbox';
import { SelectComponent } from './select';
import { toast } from 'sonner';
import { Turnstile } from '@marsidev/react-turnstile';
import { Loader } from '@googlemaps/js-api-loader';
import { cn } from '@/lib/utils';

const categories = [
  { value: 'commercio', label: 'Commercio' },
  { value: 'ristorazione', label: 'Ristorazione' },
  { value: 'servizi', label: 'Servizi' },
  { value: 'formazione', label: 'Formazione' },
  { value: 'sanita', label: 'Sanità' },
  { value: 'bellezza', label: 'Bellezza e Benessere' },
  { value: 'intrattenimento', label: 'Intrattenimento' },
  { value: 'sport', label: 'Sport e Fitness' },
  { value: 'artigianato', label: 'Artigianato' },
  { value: 'agricoltura', label: 'Agricoltura' },
  { value: 'edilizia', label: 'Edilizia' },
  { value: 'trasporti', label: 'Trasporti' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'finanza', label: 'Finanza e Assicurazioni' },
  { value: 'immobiliare', label: 'Immobiliare' },
  { value: 'altro', label: 'Altro' },
];

interface NewStoreFormProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewStoreForm({ open: externalOpen, onOpenChange: externalOnOpenChange }: NewStoreFormProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = (v: boolean) => {
    setInternalOpen(v);
    externalOnOpenChange?.(v);
  };
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  /**
   * IDs (come stringhe) dei client selezionati. L'ordine in cui l'utente li
   * seleziona è significativo: il primo elemento diventa il "cliente primario"
   * dello store (`stores.client_id`), gli altri vengono aggiunti come
   * associazioni secondarie in `store_clients`.
   */
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clients, setClients] = useState<
    { id: number; name: string; logo?: string | null }[]
  >([]);
  const [clientLogoUrls, setClientLogoUrls] = useState<Record<number, string>>({});
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const loadClients = async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, logo')
        .order('id', { ascending: true });
      if (!error && data) {
        setClients(data);
        const urls: Record<number, string> = {};
        for (const c of data) {
          if (c.logo) {
            const { data: pub } = supabase.storage
              .from('client-logos')
              .getPublicUrl(c.logo);
            if (pub?.publicUrl) urls[c.id] = pub.publicUrl;
          }
        }
        setClientLogoUrls(urls);
      }
    };
    if (isOpen) loadClients();
  }, [isOpen, supabase]);

  const toggleClient = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const geocodeAddress = async (
    address: string
  ): Promise<[number, number] | null> => {
    try {
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        version: 'weekly',
      });

      const google = await loader.load();
      const geocoder = new google.maps.Geocoder();

      return new Promise((resolve, reject) => {
        geocoder.geocode(
          { address },
          (
            results: google.maps.GeocoderResult[] | null,
            status: google.maps.GeocoderStatus
          ) => {
            if (status === 'OK' && results && results[0]) {
              const location = results[0].geometry.location;
              resolve([location.lat(), location.lng()]);
            } else {
              reject(new Error('Geocoding failed'));
            }
          }
        );
      });
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consent) {
      toast.error('È necessario accettare il consenso al trattamento dei dati');
      return;
    }
    if (!selectedCategory) {
      toast.error('È necessario selezionare una categoria');
      return;
    }
    if (selectedClientIds.length === 0) {
      toast.error('È necessario selezionare almeno un cliente');
      return;
    }
    if (!token && process.env.NODE_ENV !== 'development') {
      toast.error('Per favore completa la verifica');
      return;
    }
    setLoading(true);

    try {
      // Check daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count, error: countError } = await supabase
        .from('stores')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      if (countError) throw countError;

      if (count && count >= 100) {
        toast.error(
          'Raggiunto il limite giornaliero di punti vendita (100). Prova domani.'
        );
        setLoading(false);
        return;
      }

      if (!formRef.current) throw new Error('Form not found');
      const formData = new FormData(formRef.current);

      // Get full address
      const address = [
        formData.get('address'),
        formData.get('cap'),
        formData.get('comune'),
        formData.get('provincia'),
        formData.get('regione'),
      ]
        .filter(Boolean)
        .join(', ');

      // Geocode address
      const coordinates = await geocodeAddress(address);
      if (!coordinates) {
        toast.error(
          "Impossibile geocodificare l'indirizzo. Verifica i dati inseriti."
        );
        setLoading(false);
        return;
      }

      const clientIdsNum = selectedClientIds.map((v) => parseInt(v, 10));
      const primaryClientId = clientIdsNum[0]!;

      // Utente applicativo che sta caricando lo store (nullable lato schema:
      // se non c'è una sessione lo lasciamo NULL come per gli import bulk).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const createdBy = user?.id ?? null;

      const storeData = {
        name: formData.get('name') as string,
        address: formData.get('address') as string,
        coordinates,
        phone: formData.get('phone') as string,
        category: selectedCategory,
        client_id: primaryClientId,
        type: formData.get('type') as string,
        codice_ateco: formData.get('codice_ateco') as string,
        cap: formData.get('cap') as string,
        regione: formData.get('regione') as string,
        provincia: formData.get('provincia') as string,
        comune: formData.get('comune') as string,
        pi: formData.get('pi') as string,
        cf_azienda: formData.get('cf_azienda') as string,
        dipendenti: formData.get('dipendenti') as string,
        fatturato: formData.get('fatturato') as string,
        consent: true,
        status: 'free',
        tier: 'bronze',
        created_by: createdBy,
      };

      const { data: inserted, error } = await supabase
        .from('stores')
        .insert([storeData])
        .select('id')
        .single();
      if (error) throw error;

      // Associa lo store a TUTTI i client selezionati (incluso il primario).
      // Il primo della lista è marcato `is_primary` (unique index DB-side).
      const storeId = inserted!.id as number;
      const clientLinks = clientIdsNum.map((cid, idx) => ({
        store_id: storeId,
        client_id: cid,
        is_primary: idx === 0,
        created_by: createdBy,
      }));
      const { error: linkErr } = await supabase
        .from('store_clients')
        .insert(clientLinks);
      if (linkErr) {
        // Lo store esiste ma le associazioni multiple sono mancate: lo segnalo
        // ma non blocco la UX, il cliente primario è già su `stores.client_id`.
        console.error('store_clients insert error:', linkErr);
        toast.warning(
          'Punto vendita creato, ma alcune associazioni cliente non sono state salvate'
        );
      }

      toast.success('Punto vendita creato con successo');

      // Trigger refresh della mappa tramite evento personalizzato
      window.dispatchEvent(
        new CustomEvent('storeCreated', {
          detail: { coordinates },
        })
      );

      setSelectedCategory('');
      setSelectedClientIds([]);
      setConsent(false);
      setToken(null);
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating store:', {
        error,
        details: error instanceof Error ? error.message : 'Unknown error',
      });
      toast.error(
        'Si è verificato un errore durante la creazione del punto vendita'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* Mostra il trigger standalone solo quando non è in modalità controllata (es. direttamente nell'header) */}
      {externalOpen === undefined && (
        <SheetTrigger asChild>
          <Button variant='ghost' className='p-0 h-8 w-8 rounded-full hover:bg-white/20 transition-colors'>
            <Avatar className='h-8 w-8 flex items-center justify-center bg-transparent'>
              <Plus className='h-4 w-4 text-white' />
            </Avatar>
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className='z-[1000] overflow-y-auto'>
        <div className='h-full flex flex-col'>
          <SheetHeader>
            <SheetTitle>Nuovo Punto Vendita</SheetTitle>
            <SheetDescription>
              Inserisci i dettagli del nuovo punto vendita
            </SheetDescription>
          </SheetHeader>
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className='space-y-6 mt-4 flex-1'
          >
            {/* Informazioni Base */}
            <div className='space-y-4'>
              <h3 className='font-medium text-sm'>Informazioni Base</h3>
              <div className='space-y-2'>
                <Label>Clienti *</Label>
                <p className='text-xs text-muted-foreground'>
                  Seleziona uno o più clienti. Il primo selezionato diventa il
                  cliente principale del punto vendita.
                </p>
                <div className='flex flex-wrap gap-2'>
                  {clients.map((c) => {
                    const id = String(c.id);
                    const order = selectedClientIds.indexOf(id);
                    const selected = order !== -1;
                    const isPrimary = order === 0;
                    const logoUrl = clientLogoUrls[c.id];
                    return (
                      <button
                        key={c.id}
                        type='button'
                        onClick={() => toggleClient(id)}
                        className={cn(
                          'rounded-full text-xs px-3 py-1 border flex items-center gap-1.5 transition-colors',
                          selected
                            ? 'bg-[#224677] text-white border-[#224677]'
                            : 'bg-white text-[#224677] border-[#224677] hover:bg-[#224677]/10'
                        )}
                      >
                        {logoUrl && (
                          <img
                            src={logoUrl}
                            alt={c.name}
                            className='h-4 w-4 rounded-sm object-contain bg-white'
                          />
                        )}
                        <span>{c.name}</span>
                        {isPrimary && (
                          <span className='ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide'>
                            Principale
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='name'>Nome Attività *</Label>
                <Input id='name' name='name' required />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='category'>Categoria *</Label>
                <SelectComponent
                  placeholder='Seleziona una categoria'
                  value={selectedCategory}
                  onChange={(value) => setSelectedCategory(value || '')}
                  options={categories}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='type'>Tipo Attività</Label>
                <Input id='type' name='type' />
              </div>
            </div>

            {/* Contatti */}
            <div className='space-y-4'>
              <h3 className='font-medium text-sm'>Contatti</h3>
              <div className='space-y-2'>
                <Label htmlFor='phone'>Telefono *</Label>
                <Input id='phone' name='phone' type='tel' required />
              </div>
            </div>

            {/* Indirizzo */}
            <div className='space-y-4'>
              <h3 className='font-medium text-sm'>Indirizzo</h3>
              <div className='space-y-2'>
                <Label htmlFor='address'>Indirizzo *</Label>
                <Input id='address' name='address' required />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label htmlFor='cap'>CAP</Label>
                  <Input id='cap' name='cap' maxLength={5} />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='comune'>Comune</Label>
                  <Input id='comune' name='comune' />
                </div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label htmlFor='provincia'>Provincia</Label>
                  <Input id='provincia' name='provincia' maxLength={2} />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='regione'>Regione</Label>
                  <Input id='regione' name='regione' />
                </div>
              </div>
            </div>

            {/* Informazioni Aziendali */}
            <div className='space-y-4'>
              <h3 className='font-medium text-sm'>Informazioni Aziendali</h3>
              <div className='space-y-2'>
                <Label htmlFor='codice_ateco'>Codice ATECO</Label>
                <Input id='codice_ateco' name='codice_ateco' />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='pi'>Partita IVA *</Label>
                <Input id='pi' name='pi' required />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='cf_azienda'>Codice Fiscale Azienda</Label>
                <Input id='cf_azienda' name='cf_azienda' />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='dipendenti'>Numero Dipendenti</Label>
                <Input
                  id='dipendenti'
                  name='dipendenti'
                  type='number'
                  min='0'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='fatturato'>Fatturato Annuale</Label>
                <Input id='fatturato' name='fatturato' type='number' min='0' />
              </div>
            </div>

            {/* Consenso */}
            <div className='space-y-4'>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='consent'
                  checked={consent}
                  onCheckedChange={(checked) => setConsent(checked as boolean)}
                  required
                />
                <Label htmlFor='consent' className='text-sm'>
                  Consenso al trattamento dei dati *
                </Label>
              </div>
            </div>

            {/* Turnstile */}
            <div className='flex justify-center'>
              {process.env.NODE_ENV !== 'development' ? (
                <Turnstile
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
                  onSuccess={setToken}
                  onError={() => {
                    toast.error('Errore nella verifica. Riprova.');
                    setToken(null);
                  }}
                />
              ) : (
                <div className='text-sm text-muted-foreground'>
                  Turnstile disabilitato in sviluppo
                </div>
              )}
            </div>

            <div className='pt-4 pb-8'>
              <Button
                type='submit'
                className='w-full'
                disabled={
                  loading || (process.env.NODE_ENV !== 'development' && !token)
                }
              >
                {loading ? 'Creazione...' : 'Crea Punto Vendita'}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
