import Hero from '@/components/hero';
import Grid from '@/components/grid';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function Index({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  // Check if we have a code parameter from the OAuth callback
  if (searchParams.code) {
    const supabase = createClient();

    try {
      // Exchange the code for a session
      const { error } = await supabase.auth.exchangeCodeForSession(
        searchParams.code
      );

      if (error) {
        console.error('Error exchanging code for session:', error.message);
        // Continue to the main page if there's an error
      } else {
        // Redirect to protected page after successful authentication
        redirect('/protected');
      }
    } catch (err) {
      console.error('Exception during code exchange:', err);
      // Continue to the main page if there's an exception
    }
  }

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
