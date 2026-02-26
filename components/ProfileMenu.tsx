'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loader, LogOut, Plus, List, LayoutDashboard, Map } from 'lucide-react';
import { signOutAction } from '@/app/actions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NewStoreForm } from './NewStoreForm';
import { UserList } from './user-list';

type Role = 'agent' | 'am' | 'supervisor';

interface ProfileMenuProps {
  email: string;
  name: string;
  role: Role | null;
}

const ROLE_LABELS: Record<Role, string> = {
  agent: 'Agente',
  am: 'Area Manager',
  supervisor: 'Supervisor',
};

const ROLE_COLORS: Record<Role, string> = {
  agent: 'bg-blue-500/20 text-blue-200 border-blue-400/40',
  am: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
  supervisor: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ProfileMenu({ email, name, role }: ProfileMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [newStoreOpen, setNewStoreOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isDashboard = pathname?.includes('/dashboard');
  const initials = name ? getInitials(name) : email.slice(0, 2).toUpperCase();
  const roleLabel = role ? ROLE_LABELS[role] : 'Agente';
  const roleColor = role ? ROLE_COLORS[role] : ROLE_COLORS.agent;

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutAction();
  };

  return (
    <>
      {/* Sheets rendered outside dropdown to avoid portal conflicts */}
      <NewStoreForm open={newStoreOpen} onOpenChange={setNewStoreOpen} />
      <UserList open={activityOpen} onOpenChange={setActivityOpen} />

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='p-0 h-8 w-8 rounded-full hover:bg-white/20 transition-colors'
          >
            <Avatar className='h-8 w-8'>
              <AvatarFallback
                className='text-xs font-semibold'
                style={{ backgroundColor: '#1B304E', color: 'white', border: '2px solid rgba(255,255,255,0.3)' }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align='end'
          className='w-64 p-0 overflow-hidden border-0 z-[10000]'
          style={{ backgroundColor: '#1B304E', zIndex: 10000 }}
        >
          {/* User info header */}
          <div className='px-4 py-3 border-b border-white/10'>
            <div className='flex items-center gap-3'>
              <Avatar className='h-10 w-10 flex-shrink-0'>
                <AvatarFallback
                  className='text-sm font-bold'
                  style={{ backgroundColor: '#224677', color: 'white' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className='min-w-0'>
                {name && (
                  <p className='text-sm font-semibold text-white truncate'>{name}</p>
                )}
                <p className='text-xs text-white/60 truncate'>{email}</p>
                <span
                  className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full border font-medium ${roleColor}`}
                >
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className='py-1'>
            {isDashboard ? (
              <Link
                href='/protected'
                className='flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors'
                onClick={() => setOpen(false)}
              >
                <Map className='h-4 w-4 flex-shrink-0' />
                Mappa
              </Link>
            ) : (
              <Link
                href='/protected/dashboard'
                className='flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors'
                onClick={() => setOpen(false)}
              >
                <LayoutDashboard className='h-4 w-4 flex-shrink-0' />
                Dashboard
              </Link>
            )}

            <button
              className='flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors'
              onClick={() => {
                setOpen(false);
                setNewStoreOpen(true);
              }}
            >
              <Plus className='h-4 w-4 flex-shrink-0' />
              Nuovo punto vendita
            </button>

            <button
              className='flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors'
              onClick={() => {
                setOpen(false);
                setActivityOpen(true);
              }}
            >
              <List className='h-4 w-4 flex-shrink-0' />
              Attività in corso
            </button>
          </div>

          <DropdownMenuSeparator className='bg-white/10 my-0' />

          <div className='py-1'>
            <button
              className='flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors'
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader className='h-4 w-4 flex-shrink-0 animate-spin' />
              ) : (
                <LogOut className='h-4 w-4 flex-shrink-0' />
              )}
              {signingOut ? 'Uscita...' : 'Esci'}
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
