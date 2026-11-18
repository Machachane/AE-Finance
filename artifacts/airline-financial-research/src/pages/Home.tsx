import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BookOpen, ChevronDown, FileSpreadsheet,
  FileText, Info, LoaderCircle, Search,
} from 'lucide-react';
import AirlinePicker from '@/components/AirlinePicker';
import SiteHeader from '@/components/SiteHeader';
import {
  buildResearchCsvContent,
  buildResearchXlsxWorksheetParts,
  RESEARCH_EXPORT_COLUMNS,
  type ResearchExportRow,
} from '@/lib/research-exports';

type FinancialResultRow = ResearchExportRow;
type WorkbookRecord = Omit<FinancialResultRow, 'verificationStatus'>;
type ResultMetadataKey =
  | 'airline'
  | 'financialYear'
  | 'reportingPeriod'
  | 'fiscalYearEnd'
  | 'currency'
  | 'status'
  | 'date'
  | 'reportingScope'
  | 'ifrs16Asc842Adoption'
  | 'inAdministration'
  | 'valueBasis';
type ResultMetadataField = {
  key: ResultMetadataKey;
  label: string;
  compactHidden?: boolean;
  value: (row: FinancialResultRow) => string | null | undefined;
};

const RESULT_METADATA_FIELDS: readonly ResultMetadataField[] = [
  { key: 'airline', label: 'Airline', value: (row) => row.airline },
  { key: 'financialYear', label: 'Financial year', value: (row) => row.financialYear },
  { key: 'reportingPeriod', label: 'Reporting period', value: (row) => row.reportingPeriod },
  { key: 'fiscalYearEnd', label: 'Fiscal year-end', compactHidden: true, value: (row) => row.fiscalYearEnd },
  { key: 'currency', label: 'Currency', value: (row) => row.currency },
  { key: 'status', label: 'Status', value: (row) => row.status },
  { key: 'date', label: 'Date', value: (row) => row.date },
  { key: 'reportingScope', label: 'Reporting scope', compactHidden: true, value: (row) => row.reportingScope },
  { key: 'ifrs16Asc842Adoption', label: 'IFRS16/ASC842 adoption', compactHidden: true, value: (row) => row.ifrs16Asc842Adoption },
  { key: 'inAdministration', label: 'In administration', compactHidden: true, value: (row) => row.inAdministration },
  { key: 'valueBasis', label: 'Value basis', compactHidden: true, value: (row) => row.valueBasis },
];

const WORKBOOK_ROW_COUNT = 6358;

const METRICS = [
  { name: 'Cargo Revenue', group: 'Revenue' },
  { name: 'Cash & Liquid Investments', group: 'Assets' },
  { name: 'Depreciation & Amortisation', group: 'Profit & costs' },
  { name: 'Discontinued Operations & Extraordinary Items', group: 'Profit & costs' },
  { name: 'EBIT', group: 'Profit & costs' },
  { name: 'Forward Sales & Deferred Revenue', group: 'Revenue' },
  { name: 'Fuel Costs', group: 'Profit & costs' },
  { name: 'Lease Rents', group: 'Profit & costs' },
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

function exportCsv(rows: FinancialResultRow[]) {
  downloadBlob(new Blob(['\ufeff', buildResearchCsvContent(rows)], { type: 'text/csv;charset=utf-8' }), 'airline-financials.csv');
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

function exportXlsx(rows: FinancialResultRow[]) {
  const { sheetXml, hyperlinkRelationships } = buildResearchXlsxWorksheetParts(rows);
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Airline financials" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
    ...(hyperlinkRelationships ? [{ name: 'xl/worksheets/_rels/sheet1.xml.rels', content: hyperlinkRelationships }] : []),
  ];
  downloadBlob(makeZip(files), 'airline-financials.xlsx');
}

function formatAmount(row: FinancialResultRow) {
  if (row.amount === null) return 'Unavailable';
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(row.amount);
  return `${amount}${row.unit ? ` ${row.unit}` : ''}`;
}

export default function Home() {
  const [workbookRecords, setWorkbookRecords] = useState<WorkbookRecord[]>([]);
  const [workbookLoading, setWorkbookLoading] = useState(true);
  const [workbookError, setWorkbookError] = useState('');
  const [workbookResult, setWorkbookResult] = useState<{
    generatedAt: string;
    rows: FinancialResultRow[];
  } | null>(null);
  const [airline, setAirline] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([...DEFAULT_METRICS]);
  const [years, setYears] = useState<(2025 | 2026)[]>([2025, 2026]);
  const [activeGroup, setActiveGroup] = useState('All metrics');
  const [metricSearch, setMetricSearch] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/airline-financials.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Workbook data could not be loaded (${response.status}).`);
        return response.json() as Promise<WorkbookRecord[]>;
      })
      .then((records) => {
        if (!active) return;
        if (!Array.isArray(records) || records.length !== WORKBOOK_ROW_COUNT) {
          throw new Error('Workbook data failed its row-count check.');
        }
        setWorkbookRecords(records);
        const params = new URLSearchParams(window.location.search);
        const requestedAirline = params.get('airline');
        if (requestedAirline) {
          const matchedAirline = [...new Set(records.map((record) => record.airline))]
            .find((name) => name.toLocaleLowerCase() === requestedAirline.toLocaleLowerCase());
          if (matchedAirline) setAirline(matchedAirline);
        }
        const requestedMetric = params.get('metric');
        if (requestedMetric) {
          const matchedMetric = METRICS.find((metric) => metric.name.toLocaleLowerCase() === requestedMetric.toLocaleLowerCase());
          if (matchedMetric) setSelectedMetrics([matchedMetric.name]);
        }
        const availableYears = new Set(records.map((record) => record.financialYear));
        const requestedYears = params.getAll('year').filter((year): year is '2025' | '2026' =>
          (year === '2025' || year === '2026') && availableYears.has(year),
        );
        if (requestedYears.length) setYears([...new Set(requestedYears)].map(Number) as (2025 | 2026)[]);
        setWorkbookLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setWorkbookError(error instanceof Error ? error.message : 'Workbook data could not be loaded.');
        setWorkbookLoading(false);
      });
    return () => { active = false; };
  }, []);
  const workbookAirlines = useMemo(
    () => [...new Set(workbookRecords.map((record) => record.airline))].sort((a, b) => a.localeCompare(b)),
    [workbookRecords],
  );
  const result = workbookResult;
  const rows: FinancialResultRow[] = result?.rows ?? [];
  const sharedResultFields = useMemo(() => RESULT_METADATA_FIELDS.flatMap((field) => {
    if (!rows.length) return [];
    const values = rows.map((row) => field.value(row)?.trim() ?? '');
    const sharedValue = values[0];
    return sharedValue && values.every((value) => value === sharedValue)
      ? [{ key: field.key, label: field.label, value: sharedValue }]
      : [];
  }), [rows]);
  const sharedResultKeys = new Set(sharedResultFields.map((field) => field.key));
  const rowMetadataFields = RESULT_METADATA_FIELDS.filter((field) => !sharedResultKeys.has(field.key));
  const compactMetadataFields = rowMetadataFields.filter((field) => field.compactHidden);
  const filteredMetrics = useMemo(() => METRICS.filter((metric) =>
    (activeGroup === 'All metrics' || metric.group === activeGroup) &&
    metric.name.toLowerCase().includes(metricSearch.toLowerCase()),
  ), [activeGroup, metricSearch]);
  const isWorkbookReady = !workbookLoading && !workbookError;

  const toggleMetric = (metric: string) => setSelectedMetrics((selected) =>
    selected.includes(metric) ? selected.filter((item) => item !== metric) : [...selected, metric],
  );
  const toggleYear = (year: 2025 | 2026) => setYears((selected) =>
    selected.includes(year) ? selected.filter((item) => item !== year) : [...selected, year].sort(),
  );
  const runResearch = () => {
    if (!airline.trim() || !selectedMetrics.length || !years.length || !isWorkbookReady) return;
    const selectedAirline = airline.trim().toLocaleLowerCase();
    const selectedMetricsSet = new Set(selectedMetrics);
    const selectedYears = new Set(years.map(String));
    const exactMatches = workbookRecords.filter((record) =>
      record.airline.trim().toLocaleLowerCase() === selectedAirline,
    );
    const rows = exactMatches
      .filter((record) => selectedMetricsSet.has(record.metric) && selectedYears.has(record.financialYear))
      .map((record): FinancialResultRow => ({
        metric: record.metric,
        airline: record.airline,
        financialYear: record.financialYear,
        reportingPeriod: record.reportingPeriod,
        fiscalYearEnd: record.fiscalYearEnd,
        currency: record.currency,
        status: record.status,
        date: record.date,
        reportingScope: record.reportingScope,
        ifrs16Asc842Adoption: record.ifrs16Asc842Adoption,
        inAdministration: record.inAdministration,
        sourceUrl: record.sourceUrl,
        sourceTitle: 'Open supplied source',
        verificationStatus: 'needs_review',
        note: record.note,
        metricId: record.metricId,
        categoryId: record.categoryId,
        category: record.category,
        amount: record.amount,
        unit: record.unit,
        valueBasis: record.valueBasis,
        reportingEntity: record.reportingEntity,
      }));
    setWorkbookResult({ generatedAt: new Date().toISOString(), rows });
  };

  return (
    <div className="app-shell">
      <SiteHeader activePage="research" />

      <main className="page">
        <div className="hero">
          <div>
            <div className="eyebrow">Airline financials</div>
            <h1>Comparable financials.<br />A clear source trail.</h1>
            <p>Search the supplied 2025–26 airline workbook. Imported figures retain their source links and are clearly marked for review.</p>
          </div>
          <div className="record-mark">WORKBOOK DATASET<br />142 AIRLINES · 6,358 ROWS</div>
        </div>

        <div className="workspace-grid">
          <section className="panel setup-panel" aria-label="Financial data selection">
            <div className="section-heading"><h2>Financial data selection</h2><span className="step-number">01 / INPUT</span></div>

            <div className="selection-controls">
              <div className="selection-field">
                <label className="field-label" htmlFor="airline-input">Airline</label>
                <AirlinePicker
                  value={airline}
                  options={workbookAirlines}
                  loading={workbookLoading}
                  error={Boolean(workbookError)}
                  onChange={setAirline}
                />
              </div>

              <div className="selection-field">
                <div className="field-label"><span>Financial years</span><span className="field-hint">Select one or both</span></div>
                <div className="year-toggle">
                  {([2025, 2026] as const).map((year) => <label className={`year-option ${years.includes(year) ? 'selected' : ''}`} key={year}>
                    <input type="checkbox" checked={years.includes(year)} onChange={() => toggleYear(year)} data-testid={`checkbox-year-${year}`} /> FY {year}
                  </label>)}
                </div>
              </div>

              <div className="selection-field metrics-selection">
                <div className="field-label">
                  <span>Financial metrics</span>
                  <div className="metric-tools">
                    <button className="small-button" type="button" onClick={() => setSelectedMetrics([...METRICS.map((metric) => metric.name)])} data-testid="button-select-all">All {METRICS.length}</button>
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
                <div className="metric-footer"><span>{selectedMetrics.length} selected</span><span>{METRICS.length} available</span></div>
              </div>
            </div>

            <div className="selection-actions">
              <button className="run-button" type="button" onClick={runResearch} disabled={!airline.trim() || !selectedMetrics.length || !years.length || !isWorkbookReady} data-testid="button-run-research">
                {workbookLoading ? <><LoaderCircle size={15} className="spin" /> Loading workbook data</> : 'Show financials'}
              </button>
              <div className="boundary-note"><Info size={14} /><span>Imported workbook rows are supplied as-is, not independently verified. Some rows use third-party links or derived values; inspect the source link, source note, and value basis.</span></div>
            </div>
          </section>

          <section className="panel results-panel" aria-label="Financial results">
            <div className="results-top">
              <div className="results-title"><h2>Financial results</h2><span className="results-count" data-testid="text-result-count">{rows.length} rows</span></div>
              <div className="export-actions">
                <button type="button" className="export-button" disabled={!rows.length} onClick={() => exportCsv(rows)} data-testid="button-export-csv"><FileText size={13} /> CSV</button>
                <button type="button" className="export-button" disabled={!rows.length} onClick={() => exportXlsx(rows)} data-testid="button-export-xlsx"><FileSpreadsheet size={13} /> Excel</button>
              </div>
            </div>
            <div className="results-meta">
              <span>{result ? `Generated ${new Date(result.generatedAt).toLocaleString()}` : 'No results yet'}</span>
            </div>

            {workbookError && <div className="error-box" role="alert" data-testid="status-workbook-error">
              <AlertCircle size={17} /><div><strong>Uploaded workbook data could not be loaded</strong><p>{workbookError}</p></div>
            </div>}

            {sharedResultFields.length > 0 && <section className="results-context" aria-label="Shared reporting details">
              <h3>Shared reporting details</h3>
              <dl className="results-context-strip">
                {sharedResultFields.map((field) => <div className="results-context-item" key={field.key}>
                  <dt>{field.label}</dt><dd>{field.value}</dd>
                </div>)}
              </dl>
            </section>}

            {rows.length > 0 && <div className="table-scroll">
              <table className={`results-table ${rowMetadataFields.length === 0 ? 'results-table--shared-metadata' : ''}`}>
                <thead><tr>
                  <th className="results-col-metric">METRIC</th>
                  {rowMetadataFields.map((field) => <th key={field.key} className={`results-col-${field.key} ${field.compactHidden ? 'compact-hidden-column' : ''}`}>{field.label}</th>)}
                  <th className="results-col-amount" style={{ textAlign: 'right' }}>AMOUNT</th>
                  <th className="results-col-source">Source Link</th>
                  {compactMetadataFields.length > 0 && <th className="compact-only-column">DETAILS</th>}
                </tr></thead>
                <tbody>{rows.map((row, index) => <tr key={`${row.airline}-${row.metric}-${row.financialYear}-${index}`} data-testid={`row-research-${index}`}>
                  <td className="metric-cell results-col-metric" data-label="Metric">{row.metric}</td>
                  {rowMetadataFields.map((field) => <td key={field.key} className={`results-col-${field.key} ${field.key === 'airline' ? 'airline-cell' : ''} ${field.compactHidden ? 'compact-hidden-column' : ''}`} data-label={field.label}>{field.value(row) || '—'}</td>)}
                  <td className={`amount-cell results-col-amount ${row.amount === null ? 'muted-cell' : ''}`} data-label="Amount">{formatAmount(row)}</td>
                  <td className="results-col-source" data-label="Source link">{row.sourceUrl ? <a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer" title={row.sourceTitle ?? row.sourceUrl} data-testid={`link-source-${index}`}><span>{row.sourceTitle || 'View source'}</span><ChevronDown size={12} style={{ transform: 'rotate(-135deg)' }} /></a> : <span className="muted-cell">No source linked</span>}</td>
                  {compactMetadataFields.length > 0 && <td className="compact-only-column" data-label="Additional fields">
                    <details className="result-extra-details">
                      <summary>More</summary>
                      <dl>{compactMetadataFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value(row) || '—'}</dd></div>)}</dl>
                    </details>
                  </td>}
                </tr>)}</tbody>
              </table>
            </div>}

            {result && rows.length === 0 && <div className="empty-state" data-testid="status-empty-results">
              <div className="empty-inner"><div className="empty-icon"><Search size={21} /></div><h3>No matching financial rows</h3><p>No workbook rows matched this airline, metric, and year selection. Choose another airline or adjust the filters.</p></div>
            </div>}
            {!result && <div className="empty-state">
              <div className="empty-inner"><div className="empty-icon"><BookOpen size={21} /></div><h3>Select an airline.</h3><p>Select an airline and the metrics and years you want to view. Workbook rows are source-linked and marked for review.</p></div>
            </div>}

            <div className="footnote"><span>Unless otherwise stated, all amounts are presented in the currency reported in the airline’s published/audited accounts.</span><span>WORKBOOK FIELDS · {RESEARCH_EXPORT_COLUMNS.length}</span></div>
          </section>
        </div>
      </main>
    </div>
  );
}
