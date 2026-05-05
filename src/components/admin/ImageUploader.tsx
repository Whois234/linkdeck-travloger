'use client';
import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, FileText, Video } from 'lucide-react';

interface Props {
  value?: string | null;
  onChange: (url: string | null) => void;
  folder?: string;
  accept?: string;
  label?: string;
  placeholder?: string;
  /** e.g. "1200 × 630 px (16:9)" — shown as a hint below the uploader */
  sizeHint?: string;
}

const T = '#134956';

function fileIcon(type: string) {
  if (type.startsWith('video/')) return <Video className="w-5 h-5" />;
  if (type === 'application/pdf') return <FileText className="w-5 h-5" />;
  return <ImageIcon className="w-5 h-5" />;
}

export function ImageUploader({ value, onChange, folder = 'uploads', accept = 'image/*,application/pdf,video/*', label, placeholder, sizeHint }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const presignRes = await fetch('/api/v1/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size, folder }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok) { setError(presignData.error ?? 'Failed to get upload URL'); return; }

      const { presignedUrl, publicUrl } = presignData.data;
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) { setError('Upload to S3 failed. Check your AWS credentials.'); return; }
      onChange(publicUrl);
    } catch {
      setError('Upload failed. Check network connection.');
    } finally {
      setUploading(false);
    }
  }, [folder, onChange]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50 MB)'); return; }
    upload(file);
  }

  const isImage = value && /\.(jpg|jpeg|png|webp|gif)$/i.test(value);
  const isPdf   = value && /\.pdf$/i.test(value);

  return (
    <div>
      {label && <p className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[#64748B]">{label}</p>}

      {value ? (
        <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          {isImage ? (
            <img src={value} alt="Uploaded" className="w-full h-36 object-cover" />
          ) : (
            <div className="h-16 flex items-center gap-3 px-4" style={{ backgroundColor: '#F8FAFC' }}>
              <span style={{ color: T }}>{isPdf ? <FileText className="w-5 h-5" /> : <Video className="w-5 h-5" />}</span>
              <span className="text-xs font-medium text-[#64748B] truncate">{value.split('/').pop()}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div
          className={`relative rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${dragOver ? 'border-[#134956] bg-[#134956]/5' : 'border-[#E2E8F0] hover:border-[#134956]/40 hover:bg-[#F8FAFC]'}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-[#134956]/20 border-t-[#134956] rounded-full animate-spin" />
              <p className="text-xs text-[#64748B]">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-6 h-6 text-[#94A3B8]" />
              <p className="text-xs font-medium text-[#0F172A]">{placeholder ?? 'Click to upload or drag & drop'}</p>
              <p className="text-[11px] text-[#94A3B8]">Images, PDFs, Videos · max 50 MB</p>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {sizeHint && (
        <p className="text-[11px] mt-1.5" style={{ color: '#94A3B8' }}>
          📐 Recommended: <strong style={{ color: '#64748B' }}>{sizeHint}</strong>
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
