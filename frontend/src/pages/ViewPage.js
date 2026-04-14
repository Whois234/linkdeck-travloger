import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, AlertCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function TravlogerMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="7" fill="#144a57"/>
      <path d="M20 8 L32 14 L32 26 L20 32 L8 26 L8 14 Z" fill="none" stroke="#E8A020" strokeWidth="2"/>
      <circle cx="20" cy="20" r="5" fill="#E8A020"/>
      <path d="M20 8 L20 15 M20 25 L20 32 M8 14 L14 17 M26 23 L32 26 M8 26 L14 23 M26 17 L32 14" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export default function ViewPage() {
  const { uniqueId } = useParams();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const tracked = useRef(false);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        if (!tracked.current) {
          tracked.current = true;
          axios.post(`${API}/view/${uniqueId}/track`).catch(() => {});
        }
        const { data } = await axios.get(`${API}/view/${uniqueId}/info`);
        setPdfName(data.pdf_name);
        const pdfResp = await axios.get(`${API}/pdf-serve/${data.storage_path}`, { responseType: 'blob' });
        const blobUrl = URL.createObjectURL(pdfResp.data);
        setPdfUrl(blobUrl);
      } catch (err) {
        setError(err.response?.data?.detail || 'PDF not found or link is invalid');
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" data-testid="view-loading">
        <TravlogerMark size={48} />
        <Loader2 className="w-7 h-7 animate-spin mt-4" style={{ color: '#144a57' }} />
        <p className="text-sm text-slate-400 mt-2">Loading your itinerary...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" data-testid="view-error">
        <TravlogerMark size={48} />
        <AlertCircle className="w-10 h-10 mt-4" style={{ color: '#dc2626' }} />
        <h2 className="text-lg font-bold mt-3" style={{ color: '#144a57' }}>Link Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">{error}</p>
        <p className="text-xs text-slate-400 mt-4">
          Contact us at{' '}
          <a href="https://travloger.in" className="underline" style={{ color: '#E8A020' }}>travloger.in</a>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white" data-testid="view-page">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 h-12 border-b flex-shrink-0"
        style={{ backgroundColor: '#144a57', borderColor: 'rgba(232,160,32,0.3)' }}>
        <TravlogerMark size={24} />
        <span className="text-sm font-semibold text-white truncate flex-1">{pdfName}</span>
        <span className="text-xs font-bold tracking-widest uppercase hidden sm:inline" style={{ color: '#E8A020' }}>
          Travloger.in
        </span>
      </header>

      {/* PDF Viewer */}
      <div className="flex-1 relative">
        {pdfUrl ? (
          <iframe src={pdfUrl} title={pdfName} className="absolute inset-0 w-full h-full border-none" data-testid="pdf-iframe" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#144a57' }} />
          </div>
        )}
      </div>
    </div>
  );
}
