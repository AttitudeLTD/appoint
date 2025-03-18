import dynamic from 'next/dynamic';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

const DynamicMap = dynamic(() => import('@/components/map'), {
  ssr: false,
});

// List of allowed user IDs for the pilot phase
const ALLOWED_USER_IDS = [
  'd29f0c04-fc5d-4fc7-97c8-9c323cc0574f',
  '5e2ee0b4-415d-44b3-ae17-ccad7a7e4675',
  '137a563c-ab13-4844-bcbe-d68130b05a95',
  '10d8fe9d-7ce5-447b-968f-0cd5fa873278',
];

export default async function ProtectedPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/');
  }

  // Check if the user is allowed to access the map
  const isAllowed = ALLOWED_USER_IDS.includes(user.id);

  if (!isAllowed) {
    return (
      <main className='flex min-h-screen flex-col items-center justify-center p-6'>
        <div className='w-full max-w-md p-8 mx-auto rounded-lg bg-white shadow-lg dark:bg-slate-800 text-center'>
          <h1 className='text-2xl font-bold mb-4'>Accesso limitato</h1>
          <p className='mb-4'>
            Questa applicazione è attualmente in modalità pilota e l'accesso è
            limitato ad un gruppo ristretto di utenti.
          </p>
          <p>Grazie per la comprensione.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <DynamicMap user={user} />
    </main>
  );
}
