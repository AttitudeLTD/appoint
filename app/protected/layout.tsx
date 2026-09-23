import { EnvVarWarning } from '@/components/env-var-warning';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/server';
import { ProfileMenu } from '@/components/ProfileMenu';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  let userName = '';
  let userEmail = '';
  let userRole: 'agent' | 'am' | 'supervisor' | null = null;

  if (user) {
    const { data } = await supabase
      .from('users')
      .select('name, surname, email, role')
      .eq('id', user.id)
      .single();

    if (data) {
      userName = [data.name, data.surname].filter(Boolean).join(' ');
      userEmail = data.email || user.email || '';
      userRole = (data.role as 'agent' | 'am' | 'supervisor') || 'agent';
    } else {
      userEmail = user.email || '';
    }
  }

  return (
    <div className='flex flex-col h-screen overflow-hidden'>
      <nav className='flex-shrink-0 w-full flex justify-center border-b h-16' style={{ backgroundColor: '#224677' }}>
        <div className='w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm'>
          <div className='flex gap-5 items-center font-semibold'>
            <Link href={'/'} className='flex items-center'>
              <Image
                src='/Logo Appoint.svg'
                alt='Attitude Appoint'
                width={136}
                height={46}
                className='h-8 w-auto'
                priority
              />
            </Link>
          </div>
          <div className='flex items-center gap-3'>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <ProfileMenu
                  email={userEmail}
                  name={userName}
                  role={userRole}
                />
            )}
          </div>
        </div>
      </nav>
      <main className='flex-1 min-h-0 overflow-y-auto'>{children}</main>
      <footer
        className='flex-shrink-0 w-full flex items-center justify-center border-t text-center text-[10px] py-1'
        style={{ backgroundColor: '#224677', color: 'rgba(255,255,255,0.5)' }}
      >
        Powered by Attitude Group S.p.a.
      </footer>
    </div>
  );
}
