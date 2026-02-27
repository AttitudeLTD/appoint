import Hero from '@/components/hero';
import dynamic from 'next/dynamic';

const Grid = dynamic(() => import('@/components/grid'), { ssr: false });

export default async function Index() {
  return (
    <main className='relative bg-[#1B304E] flex justify-center items-center flex-col overflow-hidden mx-auto sm:px-10 px-5'>
      <div className='max-w-7xl w-full'>
        <Hero />
        <Grid />
      </div>
    </main>
  );
}
