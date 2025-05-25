'use client';

import { useState } from 'react';
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

export function NewStoreForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [consent, setConsent] = useState(false);
  const supabase = createClient();

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
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const storeData = {
      name: formData.get('name') as string,
      address: formData.get('address') as string,
      phone: formData.get('phone') as string,
      category: selectedCategory,
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
    };

    try {
      const { error } = await supabase.from('stores').insert([storeData]);
      if (error) throw error;

      toast.success('Punto vendita creato con successo');
      // Reset states and close modal
      setSelectedCategory('');
      setConsent(false);
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating store:', {
        error,
        storeData,
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
      <SheetTrigger asChild>
        <Button variant='ghost' className='p-0 h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8 flex items-center justify-center'>
            <Plus className='h-4 w-4' />
          </Avatar>
        </Button>
      </SheetTrigger>
      <SheetContent className='z-[1000] overflow-y-auto'>
        <div className='h-full flex flex-col'>
          <SheetHeader>
            <SheetTitle>Nuovo Store</SheetTitle>
            <SheetDescription>
              Inserisci i dettagli del nuovo store
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className='space-y-6 mt-4 flex-1'>
            {/* Informazioni Base */}
            <div className='space-y-4'>
              <h3 className='font-medium text-sm'>Informazioni Base</h3>
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

            <div className='pt-4 pb-8'>
              <Button type='submit' className='w-full' disabled={loading}>
                {loading ? 'Creazione...' : 'Crea Punto Vendita'}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
