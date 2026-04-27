'use client';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImageIcon } from 'lucide-react';

export default function MediaLibraryPage() {
  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Media Library"
        subtitle="Upload and manage images for hotels, destinations and itineraries"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Media Library' }]}
      />
      <div className="bg-white rounded-xl border p-16 text-center" style={{ borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#F0F9FF' }}>
          <ImageIcon className="w-7 h-7" style={{ color: '#134956' }} />
        </div>
        <p className="font-bold text-sm mb-1" style={{ color: '#0F172A' }}>Media Library</p>
        <p className="text-sm mb-1" style={{ color: '#64748B' }}>Upload and manage images for hotels, destinations, and itineraries.</p>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mt-3" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>Coming Soon</span>
      </div>
    </div>
  );
}
