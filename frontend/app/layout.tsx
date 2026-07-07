import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AI Career Copilot',
  description: 'Upload a resume, get an AI career profile, apply smarter.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
