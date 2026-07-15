import { GeistSans } from 'geist/font/sans';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { Toaster } from 'sonner';
import { ErrorListener } from '@/components/ErrorListener';

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'Attitude Appoint',
  description: 'Organizza le tue attività sul territorio',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' className={GeistSans.className} suppressHydrationWarning>
      <body style={{ backgroundColor: '#224677' }} className='text-foreground'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <ErrorListener />
          <div style={{ backgroundColor: '#224677' }}>{children}</div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
