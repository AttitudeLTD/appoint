'use client';

import dynamic from 'next/dynamic';
import type { User } from '@supabase/supabase-js';

const Map = dynamic(() => import('@/components/map'), { ssr: false });

export function ProtectedMap({ user }: { user: User }) {
  return <Map user={user} />;
}
