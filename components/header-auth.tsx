import { signOutAction } from '@/app/actions';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';
import Link from 'next/link';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { createClient } from '@/utils/supabase/server';
import { LogOut } from 'lucide-react';

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
      <>
        <div className='flex gap-4 items-center'>
          <div>
            <Badge
              variant={'default'}
              className='font-normal pointer-events-none'
            >
              Please update .env.local file with anon key and url
            </Badge>
          </div>
          <div className='flex gap-2'>
            <Button
              asChild
              size='sm'
              variant={'outline'}
              disabled
              className='opacity-75 cursor-none pointer-events-none'
            >
              <Link href='/sign-in'>Sign in</Link>
            </Button>
            <Button
              asChild
              size='sm'
              variant={'default'}
              disabled
              className='opacity-75 cursor-none pointer-events-none'
            >
              <Link href='/sign-up'>Sign up</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }
  return userName ? (
    <div className='flex items-center gap-4'>
      Ciao, {userName.name}!
      <form action={signOutAction}>
        <Button type='submit' variant={'outline'}>
          <LogOut />
          Esci
        </Button>
      </form>
    </div>
  ) : (
    <div className='flex gap-2'>
      <Button asChild size='sm' variant={'outline'}>
        <Link href='/sign-in'>Sign in</Link>
      </Button>
      <Button asChild size='sm' variant={'default'}>
        <Link href='/sign-up'>Sign up</Link>
      </Button>
    </div>
  );
}
