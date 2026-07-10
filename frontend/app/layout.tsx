import './globals.css';
import type { ReactNode } from 'react';
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from 'next/font/google';

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'AI Career Copilot',
  description: 'Upload a resume, get an AI career profile, apply smarter.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${publicSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen bg-[#F7F1DE] font-sans text-[#4E220F]">{children}</body>
    </html>
  );
}
