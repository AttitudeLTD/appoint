import dynamic from 'next/dynamic';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

const DynamicMap = dynamic(() => import('@/components/map'), {
  ssr: false,
});

export default async function ProtectedPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/');
  }

  return (
    <main>
      <DynamicMap user={user} />
    </main>
  );
}
