import { navItems } from '@/data';

import Hero from '@/components/hero';
import Grid from '@/components/grid';

import { FloatingNav } from '@/components/ui/floating-nav';

export default async function Index() {
  return (
    <main className='relative bg-[#1B304E] flex justify-center items-center flex-col overflow-hidden mx-auto sm:px-10 px-5'>
      <div className='max-w-7xl w-full'>
        {/* <FloatingNav navItems={navItems} /> */}
        <Hero />
        <Grid />
      </div>
    </main>
  );
}
