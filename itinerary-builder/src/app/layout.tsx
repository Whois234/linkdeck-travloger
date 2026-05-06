import type { Metadata } from 'next';
import './globals.css';
import QueryProvider from '@/components/QueryProvider';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'Travloger – Itinerary Builder',
  description: 'Premium travel itinerary and quote builder for Travloger',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
