'use client';
import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, FileText, Video, Link } from 'lucide-react';

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

export function ImageUploader({ value, onChange, folder = 'uploads', accept = 'image/*,application/pdf,video/*', label, placeholder, sizeHint }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);

      const res = await fetch('/api/v1/upload/direct', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Upload failed — check AWS credentials in Vercel settings');
        return;
      }
      onChange(data.data?.publicUrl ?? null);
    } catch {
      setError('Upload failed — network error or server not reachable');
    } finally {
      setUploading(false);
    }
  }, [folder, onChange]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50 MB)'); return; }
    upload(file);
  }

  function applyUrl() {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setUrlValue('');
    setShowUrlInput(false);
    setError('');
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
        <>
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

          {/* URL paste option */}
          <div className="mt-2">
            {showUrlInput ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="url"
                  value={urlValue}
                  onChange={e => setUrlValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') applyUrl(); if (e.key === 'Escape') { setShowUrlInput(false); setUrlValue(''); } }}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 h-8 px-3 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-[#134956]/10 bg-white"
                  style={{ borderColor: '#E2E8F0' }}
                />
                <button onClick={applyUrl} className="h-8 px-3 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: T }}>Use</button>
                <button onClick={() => { setShowUrlInput(false); setUrlValue(''); }} className="h-8 px-3 rounded-lg text-xs text-[#64748B] hover:bg-[#F1F5F9]">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setShowUrlInput(true)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] hover:text-[#134956] transition-colors"
              >
                <Link className="w-3 h-3" />
                Paste image URL instead
              </button>
            )}
          </div>
        </>
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
