import { FaLocationArrow } from 'react-icons/fa6';

import MagicButton from './ui/magic-button';
import { Spotlight } from './ui/spotlight';
import { TextGenerateEffect } from './ui/text-generate-effect';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import SignInButton from './signin-button';

const signInWithAzure = async () => {
  'use server';

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email',
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  // Redirect to the OAuth URL provided by Supabase
  if (data.url) {
    redirect(data.url);
  }
};

const Hero = () => {
  return (
    <div className='pb-20 pt-20'>
      <div>
        <Spotlight
          className='-top-40 -left-10 md:-left-32 md:-top-20 h-screen'
          fill='#88ACDD'
        />
        <Spotlight
          className='top-10 left-full h-[80vh] w-[50vw]'
          fill='#FF00FF'
        />
        <Spotlight
          className='top-28 left-80 h-[80vh] w-[50vw]'
          fill='#264E85'
        />
      </div>

      <div className='w-full mx-auto flex justify-center'>
        <Image
          src='/logo Appoint By Attitude - neg.svg'
          alt='Attitude Logo'
          width={150}
          height={150}
        />
      </div>

      {/* <div className='h-[calc(100vh-460px)] w-full bg-transparent bg-grid-white/[0.03] absolute top-0 left-0 flex items-center justify-center'>
        Radial gradient for the container to give a faded look
        <div className='absolute pointer-events-none inset-0 flex items-center justify-center bg-black-100 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]' />
      </div> */}

      <div className='flex justify-center relative my-20 z-10'>
        <div className='max-w-[89vw] md:max-w-2xl lg:max-w-[60vw] flex flex-col items-center justify-center'>
          {/* <h2 className='uppercase tracking-widest text-xs text-center text-blue-100 max-w-80'>
            Attitude Appoint
          </h2> */}

          <TextGenerateEffect
            className='text-center text-[40px] md:text-5xl lg:text-6xl'
            words='Trova la prossima Attività sul Territorio'
          />

          <p className='text-center text-white md:tracking-wider mb-4 text-sm md:text-lg lg:text-2xl'>
            Organizza le tue attività di vendita in base al miglior percorso
          </p>

          <div className='flex gap-3'>
            <a href='#about'>
              <MagicButton
                title='Scopri di più'
                icon={<FaLocationArrow />}
                position='right'
              />
            </a>
            <SignInButton signInAction={signInWithAzure} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
