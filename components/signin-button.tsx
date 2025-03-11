'use client';

import { useState, useTransition } from 'react';
import { FaGlobe } from 'react-icons/fa6';
import MagicButton from './ui/magic-button';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <MagicButton
      title={pending ? 'Caricamento...' : 'Comincia'}
      icon={<FaGlobe />}
      position='right'
      isLoading={pending}
    />
  );
}

interface SignInButtonProps {
  signInAction: () => Promise<void>;
}

export default function SignInButton({ signInAction }: SignInButtonProps) {
  return (
    <form action={signInAction}>
      <SubmitButton />
    </form>
  );
}
