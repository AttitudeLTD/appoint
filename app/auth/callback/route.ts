import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/protected';

  if (code) {
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('Error exchanging code for session:', error.message);
        return NextResponse.redirect(
          `${origin}/login?message=Errore durante l'accesso con Microsoft`
        );
      }

      // Successfully exchanged code for session
      return NextResponse.redirect(`${origin}${next}`);
    } catch (err) {
      console.error('Exception during code exchange:', err);
      return NextResponse.redirect(
        `${origin}/login?message=Errore durante l'accesso con Microsoft`
      );
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(
    `${origin}/login?message=Errore durante l'accesso con Microsoft`
  );
}
