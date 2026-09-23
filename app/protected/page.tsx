import { ProtectedMap } from '@/components/protected-map';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/');
  }

  return <ProtectedMap user={user} />;
}
