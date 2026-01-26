'use client';

import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { LayoutDashboard, Map } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function DashboardToggleButton() {
  const pathname = usePathname();
  const isDashboard = pathname?.includes('/dashboard');
  const [governanceLevel, setGovernanceLevel] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setGovernanceLevel(localStorage.getItem('appoint_governance_level'));
      } catch {
        // ignore
      }
    };

    read();

    const onGovernanceChange = () => read();
    window.addEventListener('governanceChange', onGovernanceChange as EventListener);
    window.addEventListener('storage', onGovernanceChange);
    return () => {
      window.removeEventListener(
        'governanceChange',
        onGovernanceChange as EventListener
      );
      window.removeEventListener('storage', onGovernanceChange);
    };
  }, []);

  // If "Agente" is selected, hide the dashboard button on the map view.
  if (governanceLevel === 'agent' && !isDashboard) {
    return null;
  }

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
