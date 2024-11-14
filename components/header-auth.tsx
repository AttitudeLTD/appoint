import { signOutAction } from '@/app/actions';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { createClient } from '@/utils/supabase/server';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

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
      <Avatar className='h-8 w-8'>
        <AvatarImage
          src={`https://avatar.vercel.sh/${userName.name}`}
          alt={userName.name}
        />
        <AvatarFallback>
          {userName.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <form action={signOutAction}>
        <Button type='submit' variant={'outline'}>
          <LogOut className='mr-2 scale-75' /> Esci
        </Button>
      </form>
    </div>
  ) : (
    <div className='flex gap-2'></div>
  );
}
