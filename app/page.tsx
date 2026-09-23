import Hero from '@/components/hero';
import { HomeGrid } from '@/components/home-grid';
import Link from 'next/link';

export default async function Index() {
  return (
    <main className='relative bg-[#1B304E] flex justify-center items-center flex-col overflow-hidden mx-auto sm:px-10 px-5'>
      <div className='max-w-7xl w-full'>
        <Hero />
        <HomeGrid />
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
