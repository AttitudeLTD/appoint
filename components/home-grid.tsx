'use client';

import dynamic from 'next/dynamic';

const Grid = dynamic(() => import('@/components/grid'), { ssr: false });

export function HomeGrid() {
  return <Grid />;
}
