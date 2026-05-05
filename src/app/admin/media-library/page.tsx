'use client';
import { useState, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { Upload, X, Copy, Check, Image as ImageIcon, FileText, Video, Search } from 'lucide-react';

const T = '#134956';
const ALLOWED_TYPES = ['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf','video/mp4','video/quicktime','video/webm'];

interface MediaItem { url: string; name: string; type: string; size: number; uploadedAt: string }

function fileIcon(type: string) {
  if (type.startsWith('video/')) return <Video className="w-5 h-5" />;
  if (type === 'application/pdf') return <FileText className="w-5 h-5" />;
  return <ImageIcon className="w-5 h-5" />;
}

export default function MediaLibraryPage() {
  const [items, setItems]       = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) { setError(`File type not allowed: ${file.type}`); return; }
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50 MB)'); return; }
    setError(''); setUploading(true); setProgress(`Uploading ${file.name}…`);
    try {
      const presignRes = await fetch('/api/v1/upload/presign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size, folder: 'media-library' }),
      });
      const pdata = await presignRes.json();
      if (!presignRes.ok) { setError(pdata.error ?? 'Failed to get upload URL'); return; }
      const { presignedUrl, publicUrl } = pdata.data;
      const uploadRes = await fetch(presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!uploadRes.ok) { setError('Upload failed. Check AWS credentials in .env.local'); return; }
      setItems(prev => [{ url: publicUrl, name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString() }, ...prev]);
      setProgress('');
    } catch {
      setError('Upload failed. Check network connection.');
    } finally {
      setUploading(false);
    }
  }, []);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  const displayed = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Media Library"
        subtitle="Upload and manage images, PDFs, and videos stored on AWS S3"
        crumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Media Library' }]}
      />

      {/* Upload zone */}
      <div
        className={`mb-6 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-[#134956] bg-[#134956]/5' : 'border-[#E2E8F0] hover:border-[#134956]/40 bg-white hover:bg-[#F8FAFC]'}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-[#134956]/20 border-t-[#134956] rounded-full animate-spin" />
            <p className="text-sm font-medium text-[#64748B]">{progress}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#F0F9FF' }}>
              <Upload className="w-7 h-7" style={{ color: T }} />
            </div>
            <div>
              <p className="font-semibold text-sm text-[#0F172A]">Click to upload or drag & drop files</p>
              <p className="text-xs text-[#94A3B8] mt-1">Images (JPG, PNG, WebP, GIF) · PDFs · Videos (MP4, MOV) · Max 50 MB each</p>
            </div>
            <button type="button" className="h-9 px-5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: T }}>
              Choose Files
            </button>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,video/*" className="hidden" onChange={e => handleFiles(e.target.files)} />

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {error}
          {error.includes('AWS') && (
            <p className="mt-1 text-xs">Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET to your .env.local file.</p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-[#0F172A]">{items.length} file{items.length !== 1 ? 's' : ''} uploaded this session</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…"
                className="w-48 h-9 pl-9 pr-3 rounded-lg border text-sm focus:outline-none bg-white" style={{ borderColor: '#E2E8F0' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {displayed.map((item, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden group" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {item.type.startsWith('image/') ? (
                  <div className="aspect-video overflow-hidden bg-[#F8FAFC]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className="aspect-video flex items-center justify-center" style={{ backgroundColor: '#F8FAFC' }}>
                    <span style={{ color: T }}>{fileIcon(item.type)}</span>
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-xs font-medium text-[#0F172A] truncate" title={item.name}>{item.name}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5">{(item.size / 1024).toFixed(0)} KB</p>
                  <button onClick={() => copyUrl(item.url)}
                    className="mt-2 w-full h-7 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    style={{ backgroundColor: copiedUrl === item.url ? '#DCFCE7' : '#F1F5F9', color: copiedUrl === item.url ? '#15803D' : '#64748B' }}>
                    {copiedUrl === item.url ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy URL</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && !uploading && (
        <div className="text-center py-8">
          <p className="text-sm text-[#94A3B8]">Uploaded files appear here. Files are stored permanently on AWS S3.</p>
        </div>
      )}
    </div>
  );
}
