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

export function NewStoreForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const storeData = {
      name: formData.get('name') as string,
      address: formData.get('address') as string,
      location: formData.get('location') as string,
      phone: formData.get('phone') as string,
      category: formData.get('category') as string,
      email: formData.get('email') as string,
      owner_name: formData.get('owner_name') as string,
      status: 'free',
      tier: 'bronze',
    };

    try {
      const { error } = await supabase.from('stores').insert([storeData]);
      if (error) throw error;
      setIsOpen(false);
      // Reset form
      e.currentTarget.reset();
    } catch (error) {
      console.error('Error creating store:', error);
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
          <form onSubmit={handleSubmit} className='space-y-4 mt-4 flex-1'>
            <div className='space-y-2'>
              <Label htmlFor='name'>Nome</Label>
              <Input id='name' name='name' required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='address'>Indirizzo</Label>
              <Input id='address' name='address' required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='location'>Coordinate (lat,lng)</Label>
              <Input
                id='location'
                name='location'
                placeholder='45.123,9.456'
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='phone'>Telefono</Label>
              <Input id='phone' name='phone' type='tel' required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='category'>Categoria</Label>
              <Input id='category' name='category' required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='email'>Email</Label>
              <Input id='email' name='email' type='email' required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='owner_name'>Nome Proprietario</Label>
              <Input id='owner_name' name='owner_name' required />
            </div>
            <Button type='submit' className='w-full' disabled={loading}>
              {loading ? 'Creazione...' : 'Crea Store'}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
