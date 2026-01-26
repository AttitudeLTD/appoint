import { EnvVarWarning } from '@/components/env-var-warning';
import HeaderAuth from '@/components/header-auth';
import { hasEnvVars } from '@/utils/supabase/check-env-vars';
import Link from 'next/link';
import { NewStoreForm } from '@/components/NewStoreForm';
import { DashboardToggleButton } from '@/components/dashboard-toggle-button';
import Image from 'next/image';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <nav className='w-full flex justify-center border-b h-16' style={{ backgroundColor: '#224677' }}>
        <div className='w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm'>
          <div className='flex gap-5 items-center font-semibold'>
            <Link href={'/'} className='flex items-center'>
              <Image 
                src='/Logo Appoint.svg' 
                alt='Attitude Appoint' 
                width={136} 
                height={46}
                className='h-8 w-auto'
              />
            </Link>
          </div>
          <div className='flex items-center gap-4'>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <>
                <DashboardToggleButton />
                <NewStoreForm />
                <HeaderAuth />
              </>
            )}
          </div>
        </div>
      </nav>
      <div className='flex flex-col gap-12 items-start'>{children}</div>
      <footer className='w-full flex items-center justify-center border-t mx-auto text-center text-xs pt-1' style={{ backgroundColor: '#224677', color: 'white' }}>
        <p className='pr-2'>Powered by Attitude Group S.p.a.</p>
      </footer>
    </div>
  );
}
