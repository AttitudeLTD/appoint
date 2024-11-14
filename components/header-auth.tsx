import { signOutAction } from '@/app/actions';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { createClient } from '@/utils/supabase/server';
import { LogOut, List } from 'lucide-react';
import { Avatar } from './ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';

export default async function AuthButton() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: userName, error } = await supabase
    .from('users')
    .select('name')
    .eq('id', user?.id)
    .single();

  if (!hasEnvVars) {
    return (
      <div className='flex gap-4 items-center'>
        <Badge variant={'default'} className='font-normal pointer-events-none'>
          Please update .env.local file with anon key and url
        </Badge>
      </div>
    );
  }
  return userName ? (
    <div className='flex items-center gap-4'>
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
      <form action={signOutAction}>
        <Button variant='ghost' className='p-0 h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8 flex items-center justify-center'>
            <LogOut className='h-4 w-4' />
          </Avatar>
        </Button>
      </form>
    </div>
  ) : (
    <div className='flex gap-2'></div>
  );
}
