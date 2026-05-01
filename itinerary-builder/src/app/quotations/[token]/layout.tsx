import type { Metadata } from 'next';
import {
  Cormorant_Garamond,
  Playfair_Display,
  DM_Sans,
  Inter,
  Comfortaa,
} from 'next/font/google';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
  preload: true,
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-playfair',
  display: 'swap',
  preload: true,
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
  preload: true,
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
});

const comfortaa = Comfortaa({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-comfortaa',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Your Itinerary | travloger.in',
  description: 'View your personalised travel itinerary from Travloger.',
};

export default function QuotationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cormorant.variable} ${playfair.variable} ${dmSans.variable} ${inter.variable} ${comfortaa.variable}`}>
      {children}
    </div>
  );
}
