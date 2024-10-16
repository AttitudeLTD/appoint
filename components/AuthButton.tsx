import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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

  const signOut = async () => {
    'use server';

    const supabase = createClient();
    await supabase.auth.signOut();
    return redirect('/login');
  };

  return userName ? (
    <div className='flex items-center gap-4'>
      Ciao, {userName.name}!
      <form action={signOut}>
        <button className='py-2 px-4 rounded-md no-underline bg-btn-background hover:bg-btn-background-hover'>
          Logout
        </button>
      </form>
    </div>
  ) : (
    <Link
      href='/login'
      className='py-2 px-3 flex rounded-md no-underline bg-btn-background hover:bg-btn-background-hover'
    >
      Login
    </Link>
  );
}
