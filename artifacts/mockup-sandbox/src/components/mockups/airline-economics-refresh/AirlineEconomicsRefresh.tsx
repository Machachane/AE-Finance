import { useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownToLine, BookOpen, ChevronDown, CircleHelp, FileSpreadsheet,
  FileText, Info, LoaderCircle, Plus, Search, ShieldCheck, X,
} from 'lucide-react';
import { useResearchAirlines } from './use-local-research';
import type { AirlineFinancialRow, AirlineResearchInput } from './use-local-research';
import './_group.css';

const METRICS = [
  { name: 'Cargo Revenue', group: 'Revenue' },
  { name: 'Cash & Liquid Investments', group: 'Assets' },
  { name: 'Depreciation & Amortisation', group: 'Profit & costs' },
  { name: 'Discontinued Operations & Extraordinary Items', group: 'Profit & costs' },
  { name: 'EBIT', group: 'Profit & costs' },
  { name: 'Forward Sales & Deferred Revenue', group: 'Revenue' },
  { name: 'Fuel Costs', group: 'Profit & costs' },
  { name: 'Long Term Debt & Lease Liabilities', group: 'Liabilities & equity' },
  { name: 'Net Interest', group: 'Profit & costs' },
  { name: 'Non-Operating Items', group: 'Profit & costs' },
  { name: 'Operating Profit/(Loss)', group: 'Profit & costs' },
  { name: 'Other / Unclassified Revenue', group: 'Revenue' },
  { name: 'Other Current Assets', group: 'Assets' },
  { name: 'Other Current Liabilities', group: 'Liabilities & equity' },
  { name: 'Other Finance items', group: 'Profit & costs' },
  { name: 'Other Non-Current Assets', group: 'Assets' },
  { name: 'Other Operating Costs', group: 'Profit & costs' },
  { name: 'Other-Non Current Liabilities', group: 'Liabilities & equity' },
  { name: 'Passenger Revenue', group: 'Revenue' },
  { name: 'Profit / Loss After Tax', group: 'Profit & costs' },
  { name: 'Profit / Loss Before Tax', group: 'Profit & costs' },
  { name: 'Property, Plant and Equipment', group: 'Assets' },
  { name: 'Retained Earnings & Reserves', group: 'Liabilities & equity' },
  { name: 'Share Capital', group: 'Liabilities & equity' },
  { name: 'Short Term Debt', group: 'Liabilities & equity' },
  { name: 'Staff Costs', group: 'Profit & costs' },
  { name: 'Tax', group: 'Profit & costs' },
  { name: 'Total Assets', group: 'Assets' },
  { name: 'Total Current Assets', group: 'Assets' },
  { name: 'Total Current Liabilities', group: 'Liabilities & equity' },
  { name: 'Total Equity', group: 'Liabilities & equity' },
  { name: 'Total Liabilities', group: 'Liabilities & equity' },
  { name: 'Total Non-Current Assets', group: 'Assets' },
  { name: 'Total Non-Current Liabilities', group: 'Liabilities & equity' },
  { name: 'Total Revenue', group: 'Revenue' },
  { name: 'Trade Payables', group: 'Liabilities & equity' },
  { name: 'Trade Receivables', group: 'Assets' },
] as const;

const GROUPS = ['All metrics', 'Revenue', 'Profit & costs', 'Assets', 'Liabilities & equity'];
const DEFAULT_METRICS = METRICS.map((metric) => metric.name);
const EXPORT_COLUMNS = [
  { header: 'METRIC', key: 'metric' },
  { header: 'AIRLINE', key: 'airline' },
  { header: 'FINANCIAL YEAR', key: 'financialYear' },
  { header: 'REPORTING PERIOD', key: 'reportingPeriod' },
  { header: 'FISCAL YEAR-END', key: 'fiscalYearEnd' },
  { header: 'CURRENCY', key: 'currency' },
  { header: 'STATUS', key: 'status' },
  { header: 'AMOUNT', key: 'amount' },
  { header: 'DATE', key: 'date' },
  { header: 'Reporting Scope', key: 'reportingScope' },
  { header: 'IFRS16/ASC842 Adoption', key: 'ifrs16Asc842Adoption' },
  { header: 'In Administration', key: 'inAdministration' },
  { header: 'SOURCE URL', key: 'sourceUrl' },
  { header: 'SOURCE TITLE', key: 'sourceTitle' },
  { header: 'VERIFICATION STATUS', key: 'verificationStatus' },
  { header: 'NOTES', key: 'note' },
] as const;

function escapeXml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function rowValues(row: AirlineFinancialRow): unknown[] {
  return EXPORT_COLUMNS.map(({ key }) => row[key]);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportCsv(rows: AirlineFinancialRow[]) {
  const csvCell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const content = [EXPORT_COLUMNS.map(({ header }) => header), ...rows.map(rowValues)].map((line) => line.map(csvCell).join(',')).join('\r\n');
  downloadBlob(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }), 'airline-financial-research.csv');
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ -1) >>> 0;
}

function makeZip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, position: number, value: number) => view.setUint16(position, value, true);
  const u32 = (view: DataView, position: number, value: number) => view.setUint32(position, value, true);
  files.forEach(({ name, content }) => {
    const filename = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + filename.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u32(lv, 14, checksum); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, filename.length); u16(lv, 28, 0); local.set(filename, 30);
    localParts.push(local, data);
    const central = new Uint8Array(46 + filename.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u32(cv, 16, checksum); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, filename.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0);
    u32(cv, 38, 0); u32(cv, 42, offset); central.set(filename, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
  const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  };
  return new Blob([...localParts, ...centralParts, end].map(toArrayBuffer), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function exportXlsx(rows: AirlineFinancialRow[]) {
  const allRows = [EXPORT_COLUMNS.map(({ header }) => header), ...rows.map(rowValues)];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      if (typeof value === 'number') return `<c r="${reference}" t="n"><v>${value}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Airline research" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>` },
  ];
  downloadBlob(makeZip(files), 'airline-financial-research.xlsx');
}

function formatAmount(row: AirlineFinancialRow) {
  if (row.amount === null) return 'Unavailable';
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row.amount);
  return row.currency ? `${row.currency} ${amount}` : amount;
}

export default function Home() {
  const [airlines, setAirlines] = useState<string[]>([]);
  const [airlineDraft, setAirlineDraft] = useState('');
  const [airlineInputError, setAirlineInputError] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([...DEFAULT_METRICS]);
  const [years, setYears] = useState<(2025 | 2026)[]>([2025, 2026]);
  const [activeGroup, setActiveGroup] = useState('All metrics');
  const [metricSearch, setMetricSearch] = useState('');
  const research = useResearchAirlines();
  const result = research.data;
  const rows = result?.rows ?? [];
  const filteredMetrics = useMemo(() => METRICS.filter((metric) =>
    (activeGroup === 'All metrics' || metric.group === activeGroup) &&
    metric.name.toLowerCase().includes(metricSearch.toLowerCase()),
  ), [activeGroup, metricSearch]);
  const verifiedCount = rows.filter((row) => row.verificationStatus === 'verified').length;
  const unavailableCount = rows.filter((row) => row.verificationStatus === 'unavailable').length;
  const reviewCount = rows.filter((row) => row.verificationStatus === 'needs_review').length;
  const input: AirlineResearchInput | null = airlines.length && selectedMetrics.length && years.length
    ? { airlines, metrics: selectedMetrics, years }
    : null;

  const addAirlines = () => {
    const incoming = airlineDraft.split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean);
    if (!incoming.length) return;
    const existingNames = new Set(airlines.map((name) => name.toLowerCase()));
    const uniqueIncoming = [...new Set(incoming.filter((name) => {
      const key = name.toLowerCase();
      if (existingNames.has(key)) return false;
      existingNames.add(key);
      return true;
    }))];
    if (airlines.length + uniqueIncoming.length > 10) {
      setAirlineInputError(`You can research up to 10 airlines. There is room for ${10 - airlines.length} more.`);
      return;
    }
    setAirlineInputError('');
    setAirlines((existing) => [...existing, ...uniqueIncoming]);
    setAirlineDraft('');
  };
  const toggleMetric = (metric: string) => setSelectedMetrics((selected) =>
    selected.includes(metric) ? selected.filter((item) => item !== metric) : [...selected, metric],
  );
  const toggleYear = (year: 2025 | 2026) => setYears((selected) =>
    selected.includes(year) ? selected.filter((item) => item !== year) : [...selected, year].sort(),
  );
  const runResearch = () => {
    if (!input || research.isPending) return;
    research.mutate({ data: input });
  };
  const errorText = research.error instanceof Error ? research.error.message : 'The research request could not be completed.';

  return (
    <div className="app-shell">
      <div className="airline-refresh">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Airline Financial Research home">
          <img src="/__mockup/images/airline-economics-logo.png" alt="Airline Economics" />
          <span><span className="brand-name">Airline Financial Research</span><span className="brand-sub">Evidence workspace</span></span>
        </a>
        <div className="top-right">
          <div className="source-indicator"><span className="source-dot" /><span>Official SEC data only</span></div>
          <CircleHelp size={16} aria-label="Help" />
        </div>
      </header>

      <main className="page">
        <div className="hero">
          <div>
            <div className="eyebrow">Airline financial research</div>
            <h1>Comparable financials.<br />A clear source trail.</h1>
            <p>Research reported airline financials with a source trail you can inspect. Every value is tied to an official filing—or marked unavailable.</p>
          </div>
          <div className="record-mark">RESEARCH DESK<br />US SEC FILINGS · V.01</div>
        </div>

        <div className="workspace-grid">
          <section className="panel setup-panel" aria-label="Research parameters">
            <div className="section-heading"><h2>Research parameters</h2><span className="step-number">01 / INPUT</span></div>

            <label className="field-label" htmlFor="airline-input">
              Airlines <span className="field-hint">{airlines.length} / 10</span>
            </label>
            <div className="airline-entry">
              <input
                id="airline-input"
                className="text-input"
                data-testid="input-airline"
                value={airlineDraft}
                onChange={(event) => { setAirlineDraft(event.target.value); setAirlineInputError(''); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addAirlines(); } }}
                placeholder="Type a company name"
                aria-label="Airline company name"
              />
              <button className="small-button" type="button" onClick={addAirlines} disabled={!airlineDraft.trim() || airlines.length >= 10} data-testid="button-add-airline"><Plus size={14} /> Add</button>
            </div>
            {airlineInputError && <p className="input-error" role="alert">{airlineInputError}</p>}
            {airlines.length > 0 && <div className="airline-list">
              {airlines.map((airline, index) => <span className="airline-chip" key={`${airline}-${index}`} data-testid={`chip-airline-${index}`}>
                {airline}<button type="button" aria-label={`Remove ${airline}`} onClick={() => setAirlines((all) => all.filter((_, itemIndex) => itemIndex !== index))} data-testid={`button-remove-airline-${index}`}><X size={12} /></button>
              </span>)}
            </div>}

            <div className="field-label"><span>Financial years</span><span className="field-hint">Select one or both</span></div>
            <div className="year-toggle">
              {([2025, 2026] as const).map((year) => <label className={`year-option ${years.includes(year) ? 'selected' : ''}`} key={year}>
                <input type="checkbox" checked={years.includes(year)} onChange={() => toggleYear(year)} data-testid={`checkbox-year-${year}`} /> FY {year}
              </label>)}
            </div>

            <div className="field-label">
              <span>Financial metrics</span>
              <div className="metric-tools">
                <button className="small-button" type="button" onClick={() => setSelectedMetrics([...METRICS.map((metric) => metric.name)])} data-testid="button-select-all">All 37</button>
                <button className="small-button" type="button" onClick={() => setSelectedMetrics([])} data-testid="button-clear-metrics">Clear</button>
              </div>
            </div>
            <div className="search-wrap">
              <Search size={13} />
              <input className="text-input" type="search" value={metricSearch} onChange={(event) => setMetricSearch(event.target.value)} placeholder="Find a metric" aria-label="Search metrics" data-testid="input-metric-search" />
            </div>
            <div className="category-tabs" role="tablist" aria-label="Metric categories">
              {GROUPS.map((group) => <button type="button" role="tab" aria-selected={activeGroup === group} className={`category-tab ${activeGroup === group ? 'active' : ''}`} key={group} onClick={() => setActiveGroup(group)} data-testid={`tab-metric-${GROUPS.indexOf(group)}`}>{group}</button>)}
            </div>
            <div className="metric-list">
              {filteredMetrics.map((metric) => <label className="metric-item" key={metric.name}>
                <input type="checkbox" checked={selectedMetrics.includes(metric.name)} onChange={() => toggleMetric(metric.name)} data-testid={`checkbox-metric-${METRICS.indexOf(metric)}`} />
                <span>{metric.name}</span>
              </label>)}
              {filteredMetrics.length === 0 && <div className="metric-item">No metrics match this search.</div>}
            </div>
            <div className="metric-footer"><span>{selectedMetrics.length} selected</span><span>37 available</span></div>

            <button className="run-button" type="button" onClick={runResearch} disabled={!input || research.isPending} data-testid="button-run-research">
              {research.isPending ? <><LoaderCircle size={15} className="spin" /> Researching official filings</> : <>Run research <ArrowDownToLine size={15} /></>}
            </button>
            <div className="boundary-note"><Info size={14} /><span>Source boundary: official SEC company and filing data only. Private-company values and third-party estimates are not inferred; gaps remain unavailable.</span></div>
          </section>

          <section className="panel results-panel" aria-label="Research results">
            <div className="results-top">
              <div className="results-title"><h2>Research results</h2><span className="results-count" data-testid="text-result-count">{rows.length} rows</span></div>
              <div className="export-actions">
                <button type="button" className="export-button" disabled={!rows.length} onClick={() => exportCsv(rows)} data-testid="button-export-csv"><FileText size={13} /> CSV</button>
                <button type="button" className="export-button" disabled={!rows.length} onClick={() => exportXlsx(rows)} data-testid="button-export-xlsx"><FileSpreadsheet size={13} /> Excel</button>
              </div>
            </div>
            <div className="results-meta">
              <div className="meta-summary">
                <span className="summary-item">VERIFIED <strong>{verifiedCount}</strong></span>
                <span className="summary-item">NEEDS REVIEW <strong>{reviewCount}</strong></span>
                <span className="summary-item">UNAVAILABLE <strong>{unavailableCount}</strong></span>
              </div>
              <span>{result ? `Generated ${new Date(result.generatedAt).toLocaleString()}` : 'No research run yet'}</span>
            </div>

            {research.isPending && <div className="table-scroll" aria-label="Loading research results">
              <div className="loading-row" /><div className="loading-row" /><div className="loading-row" /><div className="loading-row" /><div className="loading-row" /><div className="loading-row" />
            </div>}
            {research.isError && <div className="error-box" role="alert" data-testid="status-research-error">
              <AlertCircle size={17} /><div><strong>Research could not be completed</strong><p>{errorText}</p></div>
              <button className="retry-button" type="button" onClick={runResearch} disabled={!input} data-testid="button-retry-research">Retry</button>
            </div>}

            {!research.isPending && !research.isError && result && result.coverageNotes.length > 0 && <div className="coverage" data-testid="status-partial-coverage">
              <ShieldCheck size={15} />
              <div className="coverage-list"><strong>Coverage notes</strong>{result.coverageNotes.map((note, index) => <span key={`${index}-${note}`}>{note}</span>)}</div>
            </div>}

            {!research.isPending && !research.isError && rows.length > 0 && <div className="table-scroll">
              <table className="results-table">
                <thead><tr>
                  <th>METRIC</th><th>AIRLINE</th><th>FINANCIAL YEAR</th><th>REPORTING PERIOD</th><th>FISCAL YEAR-END</th><th>CURRENCY</th><th>STATUS</th><th style={{ textAlign: 'right' }}>AMOUNT</th><th>DATE</th><th>Reporting Scope</th><th>IFRS16/ASC842 Adoption</th><th>In Administration</th><th>Verification Status</th><th>Official Source</th><th>Notes</th>
                </tr></thead>
                <tbody>{rows.map((row, index) => <tr key={`${row.airline}-${row.metric}-${row.financialYear}-${index}`} data-testid={`row-research-${index}`}>
                  <td className="metric-cell">{row.metric}</td><td className="airline-cell">{row.airline}</td><td>{row.financialYear || '—'}</td><td>{row.reportingPeriod || '—'}</td><td>{row.fiscalYearEnd || '—'}</td><td>{row.currency || '—'}</td><td>{row.status || '—'}</td>
                  <td className={`amount-cell ${row.amount === null ? 'muted-cell' : ''}`}>{formatAmount(row)}</td><td>{row.date || '—'}</td><td className="scope-cell">{row.reportingScope || '—'}</td><td>{row.ifrs16Asc842Adoption || '—'}</td><td>{row.inAdministration || '—'}</td>
                  <td><span className={`status-badge status-${row.verificationStatus}`}>{row.verificationStatus === 'needs_review' ? 'Needs review' : row.verificationStatus}</span></td>
                  <td>{row.sourceUrl ? <a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer" title={row.sourceTitle ?? row.sourceUrl} data-testid={`link-source-${index}`}><span>{row.sourceTitle || 'View SEC filing'}</span><ChevronDown size={12} style={{ transform: 'rotate(-135deg)' }} /></a> : <span className="muted-cell">No source linked</span>}</td>
                  <td><span className="note-text">{row.note || '—'}</span></td>
                </tr>)}</tbody>
              </table>
            </div>}

            {!research.isPending && !research.isError && result && rows.length === 0 && <div className="empty-state" data-testid="status-empty-results">
              <div className="empty-inner"><div className="empty-icon"><Search size={21} /></div><h3>No comparable rows returned</h3><p>The official-source search completed, but no metric rows were available for this selection. Review the coverage notes or try a different airline or year.</p></div>
            </div>}
            {!research.isPending && !research.isError && !result && <div className="empty-state">
              <div className="empty-inner"><div className="empty-icon"><BookOpen size={21} /></div><h3>Start with a filing, not a guess.</h3><p>Add one or more airlines, choose the metrics and years, then run research. Results will appear here with the original SEC source and verification state attached.</p></div>
            </div>}

            <div className="footnote"><span>Unavailable values are preserved as unavailable; no gap-filling estimates are used.</span><span>WORKBOOK FIELDS · 16</span></div>
          </section>
        </div>
      </main>
      </div>
    </div>
  );
}
