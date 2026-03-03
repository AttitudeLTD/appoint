import { signInAreaRiservataAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/protected');

  const { error } = await searchParams;

  return (
    <main className='min-h-screen flex flex-col items-center justify-center bg-[#1B304E] px-4'>
      <div className='w-full max-w-sm space-y-6 rounded-lg border border-white/20 bg-white/10 p-6 shadow-sm'>
        <div className='space-y-2 text-center'>
          <h1 className='text-xl font-semibold text-white'>Area Riservata</h1>
          <p className='text-sm text-white/80'>
            Accedi con email e password
          </p>
        </div>

        <form action={signInAreaRiservataAction} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email' className='text-white/90'>
              Email
            </Label>
            <Input
              id='email'
              name='email'
              type='email'
              placeholder='nome@esempio.com'
              required
              autoComplete='email'
              className='border-white/20 bg-white/10 text-white placeholder:text-white/50'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='password' className='text-white/90'>
              Password
            </Label>
            <Input
              id='password'
              name='password'
              type='password'
              required
              autoComplete='current-password'
              className='border-white/20 bg-white/10 text-white placeholder:text-white/50'
            />
          </div>
          {error && (
            <p className='rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200'>
              {error}
            </p>
          )}
          <Button
            type='submit'
            className='w-full bg-white text-[#224677] hover:bg-white/90'
          >
            Accedi
          </Button>
        </form>

        <p className='text-center text-sm text-white/70'>
          <Link href='/' className='underline hover:text-white'>
            ← Torna alla home
          </Link>
        </p>
      </div>
    </main>
  );
}
