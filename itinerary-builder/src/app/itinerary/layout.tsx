import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your Itinerary | travloger.in',
  description: 'View your personalised travel itinerary from Travloger.',
};

export default function ItineraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Google Fonts for itinerary design */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,500;1,600;1,700&family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
