import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { UpdateBanner } from '@/components/UpdateBanner';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'ChainMind AI — Decentralized Knowledge Vault',
  description: 'Upload, store, and query your documents on Walrus decentralized storage with local AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full antialiased font-sans">
        <Providers>
          <UpdateBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
