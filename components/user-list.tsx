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

// Mock data
const mockStores = [
  {
    id: 1,
    name: 'Pizzeria da Mario',
    status: 'In preparazione',
    eta: '20 min',
  },
  {
    id: 2,
    name: 'Gelateria Bella Italia',
    status: 'In consegna',
    eta: '10 min',
  },
  { id: 3, name: 'Ristorante Il Gusto', status: 'Confermato', eta: '35 min' },
];

export function UserList() {
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
          {mockStores.map((store) => (
            <div
              key={store.id}
              className='flex items-center justify-between p-4 mb-3 border rounded-lg hover:bg-gray-50'
            >
              <div className='flex items-center gap-3'>
                <Store className='h-5 w-5 text-gray-500' />
                <div>
                  <h3 className='font-medium'>{store.name}</h3>
                  <p className='text-sm text-gray-500'>{store.status}</p>
                </div>
              </div>
              <div className='text-sm font-medium text-gray-500'>
                ETA: {store.eta}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
