import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Travloger – Itinerary Builder',
  description: 'Premium travel itinerary and quote builder for Travloger',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
