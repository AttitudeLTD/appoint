import Hero from '@/components/hero';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const Grid = dynamic(() => import('@/components/grid'), { ssr: false });

export default async function Index() {
  return (
    <main className='relative bg-[#1B304E] flex justify-center items-center flex-col overflow-hidden mx-auto sm:px-10 px-5'>
      <div className='max-w-7xl w-full'>
        <Hero />
        <Grid />
      </div>
      <footer className='w-full max-w-7xl py-6 text-center'>
        <Link
          href='/sign-in'
          className='text-sm text-white/70 hover:text-white transition-colors underline underline-offset-2'
        >
          Area Riservata
        </Link>
      </footer>
    </main>
  );
}
