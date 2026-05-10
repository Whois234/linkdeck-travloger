'use client';
/**
 * ExcelIO — reusable Download Template / Import / Export buttons for any admin module.
 *
 * Usage:
 *   <ExcelIO
 *     moduleName="States"
 *     columns={[{ key: 'name', label: 'State Name *' }, ...]}
 *     rows={filteredRows}          // for Export — pass the live data array
 *     rowMapper={r => ({ ... })}   // maps a DB row → flat export object
 *     importMapper={r => ({ ... })} // maps a parsed Excel row → POST body
 *     importUrl="/api/v1/states"
 *     onImportDone={load}
 *   />
 */

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, FileSpreadsheet, X, ChevronDown, ChevronUp } from 'lucide-react';

export interface ExcelColumn {
  key: string;
  label: string;    // column header shown in the Excel file
  example?: string; // shown in row 2 as a sample
}

interface RowError {
  row: number;
  message: string;
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
  const [importResult, setImportResult] = useState<{ ok: number; failed: number; errors: RowError[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  /* ── Download blank template ── */
  function downloadTemplate() {
    const header = columns.map(c => c.label);
    const example = columns.map(c => c.example ?? '');
    const ws = XLSX.utils.aoa_to_sheet([header, example]);

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
    setShowErrors(false);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

    // Strip the example row if it matches example values
    const dataRows = raw.filter((r, i) => {
      if (i === 0) {
        const vals = Object.values(r).map(v => String(v).trim());
        const examples = columns.map(c => c.example ?? '');
        return !examples.every((ex, j) => !ex || vals[j] === ex);
      }
      return true;
    }).filter(r => Object.values(r).some(v => String(v).trim() !== ''));

    if (dataRows.length === 0) {
      setImporting(false);
      setImportResult({ ok: 0, failed: 0, errors: [{ row: 0, message: 'No data rows found in the file. Make sure you filled in rows below the header.' }] });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    let okCount = 0;
    const errors: RowError[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const body = importMapper(row);

        // Client-side pre-validation: skip rows where required-looking fields are empty
        const hasName = Object.entries(body).find(([k]) => k === 'name')?.[1];
        if (hasName === '' || hasName === null || hasName === undefined) {
          errors.push({ row: i + 2, message: `Row ${i + 2}: Name is empty — skipped` });
          continue;
        }

        const res = await fetch(importUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });

        if (res.ok) {
          okCount++;
        } else {
          // Capture the actual error from the API
          let errMsg = `HTTP ${res.status}`;
          try {
            const errBody = await res.json();
            if (errBody?.error) errMsg = errBody.error;
            else if (errBody?.message) errMsg = errBody.message;
            else if (errBody?.errors) {
              // Zod flatten format
              const fieldErrors = Object.entries(errBody.errors?.fieldErrors ?? {})
                .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
                .join('; ');
              const formErrors = (errBody.errors?.formErrors ?? []).join('; ');
              errMsg = [fieldErrors, formErrors].filter(Boolean).join(' | ') || errMsg;
            }
          } catch { /* response wasn't JSON */ }
          errors.push({ row: i + 2, message: `Row ${i + 2}: ${errMsg}` });
        }
      } catch (ex) {
        errors.push({ row: i + 2, message: `Row ${i + 2}: Network error — ${ex}` });
      }
    }

    setImporting(false);
    setImportResult({ ok: okCount, failed: errors.length, errors });
    if (fileRef.current) fileRef.current.value = '';
    if (okCount > 0) onImportDone();
  }

  const btnBase = 'flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition-colors';

  return (
    <div className="flex items-center gap-2 flex-wrap">

      {/* Import result badge + error panel */}
      {importResult && (
        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full cursor-pointer select-none"
            style={{
              background: importResult.failed ? '#FEF3C7' : '#DCFCE7',
              color: importResult.failed ? '#B45309' : '#15803D',
            }}
            onClick={() => importResult.errors.length > 0 && setShowErrors(v => !v)}
            title={importResult.errors.length > 0 ? 'Click to see errors' : undefined}
          >
            {importResult.ok > 0 ? `✓ ${importResult.ok} imported` : ''}
            {importResult.ok > 0 && importResult.failed > 0 ? ' · ' : ''}
            {importResult.failed > 0 ? `${importResult.failed} failed` : ''}
            {importResult.ok === 0 && importResult.failed === 0 ? 'No data found' : ''}
            {importResult.errors.length > 0 && (showErrors ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />)}
          </span>
          <button onClick={() => { setImportResult(null); setShowErrors(false); }} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Error dropdown */}
          {showErrors && importResult.errors.length > 0 && (
            <div
              className="absolute z-50 mt-8 w-96 rounded-xl border bg-white shadow-xl text-xs p-3 space-y-1 max-h-60 overflow-y-auto"
              style={{ borderColor: '#E2E8F0', top: 'auto' }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-red-600">Import errors ({importResult.errors.length})</p>
                <button
                  onClick={() => setShowErrors(false)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {importResult.errors.map((e, i) => (
                <div key={i} className="text-red-700 bg-red-50 rounded px-2 py-1">{e.message}</div>
              ))}
            </div>
          )}
        </div>
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
