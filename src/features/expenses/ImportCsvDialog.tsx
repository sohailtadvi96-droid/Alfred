import { useMemo, useRef, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { money, shortDate } from '@/lib/format';
import { useAccounts, useImportStatement } from './hooks';
import {
  guessColumnMap,
  mapRows,
  parseCsvFile,
  type CsvColumnMap,
  type DateFormat,
  type ParsedCsv,
} from './csv';

const DATE_FORMATS: DateFormat[] = ['auto', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'];
const FIELDS: { key: keyof CsvColumnMap; label: string; hint: string }[] = [
  { key: 'date', label: 'Date', hint: 'required' },
  { key: 'description', label: 'Description', hint: 'merchant / narration' },
  { key: 'debit', label: 'Debit column', hint: 'money out (if separate)' },
  { key: 'credit', label: 'Credit column', hint: 'money in (if separate)' },
  { key: 'amount', label: 'Single amount', hint: 'use if no debit/credit split' },
];

// remember the last mapping so repeat uploads from the same bank are one-click
const PREFS_KEY = 'alfred-csv-import-prefs';
interface CsvPrefs {
  map: CsvColumnMap;
  dateFmt: DateFormat;
  accountId: string;
}
function readPrefs(): CsvPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as CsvPrefs) : null;
  } catch {
    return null;
  }
}
function writePrefs(p: CsvPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
function mapFitsHeaders(map: CsvColumnMap, headers: string[]): boolean {
  const set = new Set(headers);
  return (Object.keys(map) as (keyof CsvColumnMap)[]).every((k) => !map[k] || set.has(map[k]));
}

export function ImportCsvDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: accounts } = useAccounts();
  const importer = useImportStatement();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [map, setMap] = useState<CsvColumnMap | null>(null);
  const [dateFmt, setDateFmt] = useState<DateFormat>('auto');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; total: number; skipped: number } | null>(null);

  function reset() {
    setFileName('');
    setParsed(null);
    setMap(null);
    setDateFmt('auto');
    setAccountId('');
    setError(null);
    setResult(null);
  }

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const p = await parseCsvFile(file);
      if (!p.headers.length || !p.rows.length) {
        setError('That file has no readable rows. Export the statement as CSV with a header row.');
        return;
      }
      setFileName(file.name);
      setParsed(p);

      const prefs = readPrefs();
      if (prefs && mapFitsHeaders(prefs.map, p.headers)) {
        setMap(prefs.map);
        setDateFmt(prefs.dateFmt);
        setAccountId(
          prefs.accountId && (accounts ?? []).some((a) => a.id === prefs.accountId)
            ? prefs.accountId
            : '',
        );
      } else {
        setMap(guessColumnMap(p.headers));
      }
    } catch (err) {
      setError(errMessage(err, 'Could not read the CSV.'));
    }
  }

  const preview = useMemo(() => {
    if (!parsed || !map) return null;
    return mapRows(parsed, map, dateFmt);
  }, [parsed, map, dateFmt]);

  async function onImport() {
    if (!preview || preview.ok.length === 0 || !map) return;
    setError(null);
    try {
      const inserted = await importer.mutateAsync({
        rows: preview.ok as unknown as Record<string, unknown>[],
        accountId: accountId || null,
      });
      writePrefs({ map, dateFmt, accountId });
      setResult({ inserted, total: preview.ok.length, skipped: preview.skipped });
    } catch (err) {
      setError(errMessage(err, 'Import failed.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Import bank statement"
      description="CSV for now — email and account-aggregator sync come later."
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
            <button
              className="btn primary sm"
              type="button"
              onClick={onImport}
              disabled={!preview || preview.ok.length === 0 || importer.isPending}
            >
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
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />

          {!parsed ? (
            <button className="csv-drop" type="button" onClick={() => fileRef.current?.click()}>
              <span className="csv-drop-t">Choose a CSV file</span>
              <span className="csv-drop-s">A bank-statement export with a header row</span>
            </button>
          ) : (
            <>
              <div className="csv-file">
                <span className="mono">{fileName}</span>
                <button className="btn ghost sm" type="button" onClick={() => fileRef.current?.click()}>
                  Change
                </button>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>Date format</label>
                  <select className="input" value={dateFmt} onChange={(e) => setDateFmt(e.target.value as DateFormat)}>
                    {DATE_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Account</label>
                  <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
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

              <div className="csv-map">
                {FIELDS.map((f) => (
                  <div className="field" key={f.key}>
                    <label>
                      {f.label} <span className="hint">{f.hint}</span>
                    </label>
                    <select
                      className="input"
                      value={map?.[f.key] ?? ''}
                      onChange={(e) => setMap((m) => (m ? { ...m, [f.key]: e.target.value } : m))}
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

              {preview && (
                <div className="csv-preview">
                  <div className="csv-preview-h">
                    <span className="tlabel">
                      {preview.ok.length} ready
                      {preview.skipped > 0 ? ` · ${preview.skipped} skipped` : ''}
                    </span>
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
                  {preview.ok.length === 0 && (
                    <p className="csv-warn">
                      No rows mapped. Check the Date column and either a Debit/Credit pair or the
                      single-amount column.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
        </>
      )}
    </Dialog>
  );
}
