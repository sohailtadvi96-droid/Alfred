import { useMemo, useRef, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { money, shortDate } from '@/lib/format';
import { useAccounts, useImportStatement, useRecategorizeAll } from './hooks';
import {
  guessColumnMap,
  mapRows,
  parseCsvFile,
  type CsvColumnMap,
  type ParsedCsv,
} from './csv';
import type { DateFormat, ParseResult } from './statement';
// pdf.ts pulls in pdfjs-dist (~1 MB) — load it only when a PDF is actually picked
const loadPdf = () => import('./pdf');

const DATE_FORMATS: DateFormat[] = ['auto', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'];
const FIELDS: { key: keyof CsvColumnMap; label: string; hint: string }[] = [
  { key: 'date', label: 'Date', hint: 'required' },
  { key: 'description', label: 'Description', hint: 'merchant / narration' },
  { key: 'debit', label: 'Debit column', hint: 'money out (if separate)' },
  { key: 'credit', label: 'Credit column', hint: 'money in (if separate)' },
  { key: 'amount', label: 'Single amount', hint: 'use if no debit/credit split' },
  { key: 'balance', label: 'Balance', hint: 'optional — sharpens dedupe' },
];

// remembered so repeat uploads from the same bank are one-click
const CSV_PREFS_KEY = 'alfred-csv-import-prefs';
const PDF_PW_KEY = 'alfred-pdf-statement-pw';
const ACCOUNT_KEY = 'alfred-statement-account';

interface CsvPrefs {
  map: CsvColumnMap;
  dateFmt: DateFormat;
}
function readCsvPrefs(): CsvPrefs | null {
  try {
    const raw = localStorage.getItem(CSV_PREFS_KEY);
    return raw ? (JSON.parse(raw) as CsvPrefs) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function mapFitsHeaders(map: CsvColumnMap, headers: string[]): boolean {
  const set = new Set(headers);
  return (Object.keys(map) as (keyof CsvColumnMap)[]).every((k) => !map[k] || set.has(map[k]));
}

type Kind = 'csv' | 'pdf';

export function ImportStatementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: accounts } = useAccounts();
  const importer = useImportStatement();
  const recat = useRecategorizeAll();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [recatDone, setRecatDone] = useState<number | null>(null);

  const [kind, setKind] = useState<Kind | null>(null);
  const [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState(() => read(ACCOUNT_KEY));

  // csv state
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [map, setMap] = useState<CsvColumnMap | null>(null);
  const [dateFmt, setDateFmt] = useState<DateFormat>('auto');

  // pdf state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [password, setPassword] = useState(() => read(PDF_PW_KEY));
  const [rememberPw, setRememberPw] = useState(() => read(PDF_PW_KEY) !== '');
  const [pdfResult, setPdfResult] = useState<ParseResult | null>(null);
  const [reading, setReading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; total: number; skipped: number } | null>(
    null,
  );

  function reset() {
    setKind(null);
    setFileName('');
    setParsed(null);
    setMap(null);
    setDateFmt('auto');
    setPdfFile(null);
    setPdfResult(null);
    setReading(false);
    setError(null);
    setResult(null);
    setShowSkipped(false);
    setRecatDone(null);
  }

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';

    if (isPdf) {
      setKind('pdf');
      setParsed(null);
      setMap(null);
      setPdfFile(file);
      setPdfResult(null);
      if (password) void readPdf(file, password);
      return;
    }

    setKind('csv');
    setPdfFile(null);
    try {
      const p = await parseCsvFile(file);
      if (!p.headers.length || !p.rows.length) {
        setError('That file has no readable rows. Export the statement as CSV with a header row.');
        return;
      }
      setParsed(p);
      const prefs = readCsvPrefs();
      if (prefs && mapFitsHeaders(prefs.map, p.headers)) {
        setMap(prefs.map);
        setDateFmt(prefs.dateFmt);
      } else {
        setMap(guessColumnMap(p.headers));
      }
    } catch (err) {
      setError(errMessage(err, 'Could not read the CSV.'));
    }
  }

  async function readPdf(file: File, pw: string) {
    setError(null);
    setReading(true);
    setPdfResult(null);
    try {
      const { extractPdfLines, parseStatementLines } = await loadPdf();
      const ex = await extractPdfLines(file, pw);
      if (!ex.ok) {
        if (ex.reason === 'password-required')
          setError('This PDF is password protected — enter the password and try again.');
        else if (ex.reason === 'password-wrong') setError('Wrong password.');
        else setError(ex.message || 'Could not read the PDF.');
        return;
      }
      const res = parseStatementLines(ex.lines);
      setPdfResult(res);
      if (res.ok.length === 0) {
        setError(
          "Couldn't find any transaction rows in this PDF. If your bank's layout is unusual, use the CSV export instead.",
        );
      }
    } catch (err) {
      setError(errMessage(err, 'Could not read the PDF.'));
    } finally {
      setReading(false);
    }
  }

  const csvPreview = useMemo(() => {
    if (kind !== 'csv' || !parsed || !map) return null;
    return mapRows(parsed, map, dateFmt);
  }, [kind, parsed, map, dateFmt]);

  const preview: ParseResult | null = kind === 'pdf' ? pdfResult : csvPreview;

  async function onImport() {
    if (!preview || preview.ok.length === 0) return;
    setError(null);
    try {
      const inserted = await importer.mutateAsync({
        rows: preview.ok as unknown as Record<string, unknown>[],
        accountId: accountId || null,
      });
      write(ACCOUNT_KEY, accountId);
      if (kind === 'csv' && map) {
        try {
          localStorage.setItem(CSV_PREFS_KEY, JSON.stringify({ map, dateFmt }));
        } catch {
          /* ignore */
        }
      }
      if (kind === 'pdf') write(PDF_PW_KEY, rememberPw ? password : '');
      setResult({ inserted, total: preview.ok.length, skipped: preview.skipped });
    } catch (err) {
      setError(errMessage(err, 'Import failed.'));
    }
  }

  const canImport = !!preview && preview.ok.length > 0 && !importer.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Import bank statement"
      description="CSV or password-protected PDF. Parsed on this device — the file is never uploaded."
      footer={
        result ? (
          <button className="btn primary sm" onClick={() => onOpenChange(false)}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button className="btn primary sm" type="button" onClick={onImport} disabled={!canImport}>
              {importer.isPending
                ? 'Importing…'
                : preview
                  ? `Import ${preview.ok.length} rows`
                  : 'Import'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="csv-result">
          <div className="csv-result-big">{result.inserted}</div>
          <p>
            {result.inserted === 0 ? (
              <>No new transactions — all {result.total} rows were already imported.</>
            ) : (
              <>
                Imported <b>{result.inserted}</b> new transaction
                {result.inserted === 1 ? '' : 's'}.
                {result.total - result.inserted > 0 &&
                  ` ${result.total - result.inserted} were already on file (skipped).`}
              </>
            )}
            {result.skipped > 0 &&
              ` ${result.skipped} row${result.skipped === 1 ? '' : 's'} couldn’t be read.`}
          </p>
          <div className="csv-recat">
            {recatDone === null ? (
              <button
                className="btn sec sm"
                type="button"
                onClick={async () => {
                  try {
                    setRecatDone(await recat.mutateAsync());
                  } catch (err) {
                    setError(errMessage(err, 'Could not re-run rules.'));
                  }
                }}
                disabled={recat.isPending}
              >
                {recat.isPending ? 'Re-running…' : 'Re-run categorisation rules'}
              </button>
            ) : (
              <span className="tlabel">
                {recatDone} transaction{recatDone === 1 ? '' : 's'} recategorised
              </span>
            )}
          </div>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.pdf,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />

          {!kind ? (
            <button className="csv-drop" type="button" onClick={() => fileRef.current?.click()}>
              <span className="csv-drop-t">Choose a CSV or PDF</span>
              <span className="csv-drop-s">A bank-statement export or downloaded PDF</span>
            </button>
          ) : (
            <>
              <div className="csv-file">
                <span className="mono">{fileName}</span>
                <button className="btn ghost sm" type="button" onClick={() => fileRef.current?.click()}>
                  Change
                </button>
              </div>

              {kind === 'pdf' && (
                <div className="pdf-pw">
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label htmlFor="pdf-pw">PDF password</label>
                    <input
                      id="pdf-pw"
                      className="input"
                      type="password"
                      value={password}
                      autoFocus
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && pdfFile && password) void readPdf(pdfFile, password);
                      }}
                      placeholder="one-time password on the statement email"
                    />
                  </div>
                  <label className="pdf-remember">
                    <input
                      type="checkbox"
                      checked={rememberPw}
                      onChange={(e) => setRememberPw(e.target.checked)}
                    />
                    Remember on this device
                  </label>
                  <button
                    className="btn sec sm"
                    type="button"
                    onClick={() => pdfFile && password && readPdf(pdfFile, password)}
                    disabled={!pdfFile || !password || reading}
                  >
                    {reading ? 'Reading…' : pdfResult ? 'Re-read' : 'Read PDF'}
                  </button>
                </div>
              )}

              <div className="field-row" style={{ marginTop: 12 }}>
                {kind === 'csv' && (
                  <div className="field">
                    <label>Date format</label>
                    <select
                      className="input"
                      value={dateFmt}
                      onChange={(e) => setDateFmt(e.target.value as DateFormat)}
                    >
                      {DATE_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label>Account</label>
                  <select
                    className="input"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="">— none —</option>
                    {(accounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.last4 ? ` ··${a.last4}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {kind === 'csv' && parsed && (
                <div className="csv-map">
                  {FIELDS.map((f) => (
                    <div className="field" key={f.key}>
                      <label>
                        {f.label} <span className="hint">{f.hint}</span>
                      </label>
                      <select
                        className="input"
                        value={map?.[f.key] ?? ''}
                        onChange={(e) =>
                          setMap((m) => (m ? { ...m, [f.key]: e.target.value } : m))
                        }
                      >
                        <option value="">—</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {preview && (
                <div className="csv-preview">
                  <div className="csv-preview-h">
                    <span className="tlabel">
                      {preview.ok.length} ready
                      {preview.skipped > 0 ? ` · ${preview.skipped} skipped` : ''}
                    </span>
                    {preview.skipped > 0 && (
                      <button
                        type="button"
                        className="csv-skip-toggle"
                        onClick={() => setShowSkipped((s) => !s)}
                      >
                        {showSkipped ? 'hide skipped' : 'show skipped'}
                      </button>
                    )}
                  </div>
                  <table>
                    <tbody>
                      {preview.ok.slice(0, 6).map((r) => (
                        <tr key={r.external_ref}>
                          <td className="mono">{shortDate(r.occurred_at)}</td>
                          <td className="csv-desc">{r.merchant_raw || '—'}</td>
                          <td className={`mono csv-amt${r.direction === 'credit' ? ' in' : ''}`}>
                            {r.direction === 'credit' ? '+' : '−'}
                            {money(r.amount_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {showSkipped && preview.skippedRows.length > 0 && (
                    <div className="csv-skipped">
                      <div className="tlabel">Skipped — not recognised as transactions</div>
                      <ul>
                        {preview.skippedRows.slice(0, 30).map((line, i) => (
                          <li key={i} className="mono">
                            {line}
                          </li>
                        ))}
                      </ul>
                      {preview.skippedRows.length > 30 && (
                        <div className="tlabel">
                          + {preview.skippedRows.length - 30} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="err" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
