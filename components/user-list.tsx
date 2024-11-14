import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { List } from 'lucide-react';

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
        className='h-[96%] sm:h-[385px] sm:rounded-t-[10px]'
      >
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        {/* Add your sheet content here */}
      </SheetContent>
    </Sheet>
  );
}
