import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'CricLive — Live Cricket Scoring',
  description: 'Real-time cricket scoring, stats and tournament management.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
