'use client';

import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { LayoutDashboard, Map } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DashboardToggleButtonProps {
  role: 'agent' | 'am' | 'supervisor' | null;
}

export function DashboardToggleButton({ role }: DashboardToggleButtonProps) {
  const pathname = usePathname();
  const isDashboard = pathname?.includes('/dashboard');

  return (
    <Link href={isDashboard ? '/protected' : '/protected/dashboard'}>
      <Button variant='ghost' className='p-0 h-8 w-8 rounded-full hover:bg-white/20 transition-colors'>
        <Avatar className='h-8 w-8 flex items-center justify-center bg-transparent'>
          {isDashboard ? (
            <Map className='h-4 w-4 text-white' />
          ) : (
            <LayoutDashboard className='h-4 w-4 text-white' />
          )}
        </Avatar>
      </Button>
    </Link>
  );
}
