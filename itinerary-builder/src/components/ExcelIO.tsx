'use client';
/**
 * ExcelIO — reusable Download Template / Import / Export buttons for any admin module.
 *
 * Usage:
 *   <ExcelIO
 *     moduleName="States"
 *     columns={[{ key: 'name', label: 'State Name *' }, ...]}
 *     rows={filteredRows}         // for Export — pass the live data array
 *     rowMapper={r => ({ ... })} // maps a DB row → flat export object
 *     importMapper={r => ({ ... })} // maps a parsed Excel row → POST body
 *     importUrl="/api/v1/states"
 *     onImportDone={load}
 *   />
 */

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';

export interface ExcelColumn {
  key: string;
  label: string; // column header shown in the Excel file
  example?: string; // shown in row 2 as a sample
}

interface Props<T> {
  moduleName: string;
  columns: ExcelColumn[];
  rows: T[];
  rowMapper: (row: T) => Record<string, string | number | boolean | null | undefined>;
  importMapper: (row: Record<string, string>) => Record<string, unknown>;
  importUrl: string;
  onImportDone: () => void;
}

export default function ExcelIO<T>({
  moduleName, columns, rows, rowMapper, importMapper, importUrl, onImportDone,
}: Props<T>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; failed: number } | null>(null);

  /* ── Download blank template ── */
  function downloadTemplate() {
    const header = columns.map(c => c.label);
    const example = columns.map(c => c.example ?? '');
    const ws = XLSX.utils.aoa_to_sheet([header, example]);

    // Style header row bold + teal fill via cell metadata (basic)
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '134956' } },
        alignment: { horizontal: 'center' },
      };
    }

    // Set reasonable column widths
    ws['!cols'] = columns.map(() => ({ wch: 22 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, moduleName);
    XLSX.writeFile(wb, `${moduleName.replace(/\s+/g, '_')}_Template.xlsx`);
  }

  /* ── Export current data ── */
  function exportData() {
    if (!rows.length) { alert('No data to export.'); return; }
    const data = rows.map(rowMapper);
    const ws = XLSX.utils.json_to_sheet(data, { header: columns.map(c => c.label) });
    ws['!cols'] = columns.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, moduleName);
    XLSX.writeFile(wb, `${moduleName.replace(/\s+/g, '_')}_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* ── Import uploaded Excel ── */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

    // Strip the example row if it matches the example values
    const rows = raw.filter((r, i) => {
      if (i === 0) {
        const vals = Object.values(r).map(v => String(v).trim());
        const examples = columns.map(c => c.example ?? '');
        return !examples.every((ex, j) => !ex || vals[j] === ex);
      }
      return true;
    }).filter(r => Object.values(r).some(v => String(v).trim() !== ''));

    let ok = 0, failed = 0;
    for (const row of rows) {
      try {
        const body = importMapper(row);
        const res = await fetch(importUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) ok++; else failed++;
      } catch { failed++; }
    }

    setImporting(false);
    setImportResult({ ok, failed });
    if (fileRef.current) fileRef.current.value = '';
    if (ok > 0) onImportDone();
  }

  const btnBase = 'flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition-colors';

  return (
    <div className="flex items-center gap-2">
      {/* Import result toast */}
      {importResult && (
        <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{
          background: importResult.failed ? '#FEF3C7' : '#DCFCE7',
          color: importResult.failed ? '#B45309' : '#15803D',
        }}>
          ✓ {importResult.ok} imported{importResult.failed ? ` · ${importResult.failed} failed` : ''}
        </span>
      )}

      {/* Download Template */}
      <button
        onClick={downloadTemplate}
        title="Download blank Excel template"
        className={btnBase}
        style={{ border: '1px solid #E2E8F0', color: '#134956', background: '#F0F7F9' }}
      >
        <FileSpreadsheet className="w-3.5 h-3.5" />
        Template
      </button>

      {/* Import */}
      <label
        title="Upload filled Excel to import data"
        className={`${btnBase} cursor-pointer`}
        style={{ border: '1px solid #134956', color: '#134956', background: 'white' }}
      >
        <Upload className="w-3.5 h-3.5" />
        {importing ? 'Importing…' : 'Import'}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={importing} />
      </label>

      {/* Export */}
      <button
        onClick={exportData}
        title="Export all current data to Excel"
        className={btnBase}
        style={{ border: '1px solid #E2E8F0', color: '#64748B', background: 'white' }}
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>
    </div>
  );
}
