'use client';
import { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Strikethrough } from 'lucide-react';

interface RichTextEditorProps {
  value: string | null;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: number | string;
}

/** Detect if a string contains HTML tags */
function isHtml(s: string) { return /<[a-z][\s\S]*>/i.test(s); }

/** Convert plain text (newline-separated, possibly with "- " bullets) → basic HTML */
function plainToHtml(text: string): string {
  if (!text) return '';
  if (isHtml(text)) return text;
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join('');
}

export function RichTextEditor({ value, onChange, placeholder = 'Describe the day…', minHeight = 130 }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);

  /* Sync value → innerHTML only when value changes from outside (not on every keystroke) */
  useEffect(() => {
    if (!ref.current) return;
    if (skipSync.current) { skipSync.current = false; return; }
    const html = plainToHtml(value ?? '');
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [value]);

  const exec = useCallback((cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg ?? undefined);
    if (ref.current) { skipSync.current = true; onChange(ref.current.innerHTML || ''); }
  }, [onChange]);

  const handleInput = useCallback(() => {
    skipSync.current = true;
    if (ref.current) onChange(ref.current.innerHTML || '');
  }, [onChange]);

  function Btn({ title, icon, cmd, arg }: { title: string; icon: React.ReactNode; cmd: string; arg?: string }) {
    return (
      <button type="button" title={title}
        onMouseDown={e => { e.preventDefault(); exec(cmd, arg); }}
        className="w-7 h-7 rounded flex items-center justify-center text-[#64748B] hover:bg-[#DDE6E9] hover:text-[#0F172A] transition-colors">
        {icon}
      </button>
    );
  }

  return (
    <>
      {/* Inline CSS for placeholder and list styles inside the editable */}
      <style>{`
        .tl-rte:empty:before {
          content: attr(data-placeholder);
          color: #94A3B8;
          pointer-events: none;
          display: block;
        }
        .tl-rte ul { list-style: disc; padding-left: 1.25rem; margin: 4px 0; }
        .tl-rte ol { list-style: decimal; padding-left: 1.25rem; margin: 4px 0; }
        .tl-rte li { margin-bottom: 2px; }
        .tl-rte p { margin: 0 0 4px; }
        .tl-rte b, .tl-rte strong { font-weight: 600; }
      `}</style>

      <div className="rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-[#134956]/10" style={{ borderColor: '#E2E8F0' }}>
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b" style={{ borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
          <Btn title="Bold (Ctrl+B)"        icon={<Bold           className="w-3.5 h-3.5" />} cmd="bold" />
          <Btn title="Italic (Ctrl+I)"      icon={<Italic         className="w-3.5 h-3.5" />} cmd="italic" />
          <Btn title="Underline (Ctrl+U)"   icon={<Underline      className="w-3.5 h-3.5" />} cmd="underline" />
          <Btn title="Strikethrough"        icon={<Strikethrough  className="w-3.5 h-3.5" />} cmd="strikeThrough" />
          <div className="w-px h-4 mx-1 bg-[#E2E8F0]" />
          <Btn title="Bullet list"   icon={<List        className="w-3.5 h-3.5" />} cmd="insertUnorderedList" />
          <Btn title="Numbered list" icon={<ListOrdered className="w-3.5 h-3.5" />} cmd="insertOrderedList" />
          <div className="w-px h-4 mx-1 bg-[#E2E8F0]" />
          {/* Heading shortcuts */}
          <button type="button" title="Heading" onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<h4>'); }}
            className="h-7 px-2 rounded flex items-center text-[11px] font-bold text-[#64748B] hover:bg-[#DDE6E9] hover:text-[#0F172A] transition-colors">H</button>
          <button type="button" title="Normal paragraph" onMouseDown={e => { e.preventDefault(); exec('formatBlock', '<p>'); }}
            className="h-7 px-2 rounded flex items-center text-[11px] text-[#64748B] hover:bg-[#DDE6E9] hover:text-[#0F172A] transition-colors">¶</button>
        </div>

        {/* ── Editable area ── */}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          data-placeholder={placeholder}
          className="tl-rte px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none leading-relaxed"
          style={{ minHeight }}
        />
      </div>
    </>
  );
}
