import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, FileText, Info, LoaderCircle } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import { exportStatementCsv, exportStatementXlsx, type StatementExportRow } from '@/lib/statement-exports';

type WorkbookRecord = StatementExportRow & {
  category: string;
};

const WORKBOOK_ROW_COUNT = 6358;
const BALANCE_SHEET_METRICS = new Set([
  'Cash & Liquid Investments',
  'Forward Sales & Deferred Revenue',
  'Long Term Debt & Lease Liabilities',
  'Other Current Assets',
  'Other Current Liabilities',
  'Other Non-Current Assets',
  'Other-Non Current Liabilities',
  'Property, Plant and Equipment',
  'Retained Earnings & Reserves',
  'Share Capital',
  'Short Term Debt',
  'Total Assets',
  'Total Current Assets',
  'Total Current Liabilities',
  'Total Equity',
  'Total Liabilities',
  'Total Non-Current Assets',
  'Total Non-Current Liabilities',
  'Trade Payables',
  'Trade Receivables',
]);
const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR'];
const CATEGORY_ORDER: Record<'Balance Sheet' | 'Profit & Loss', string[]> = {
  'Balance Sheet': [
    'Equity', 'Current/Non-Current', 'Current Assets', 'Non-Current Assets', 'Total Assets',
    'Current Liabilities', 'Non-Current Liabilities', 'Total Liabilities', 'Total Equity',
  ],
  'Profit & Loss': ['Revenue', 'Total Revenue', 'Costs', 'Profit/(Loss)', 'Financial/Taxation'],
};

function formatAmount(row: WorkbookRecord) {
  if (row.amount === null) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(row.amount);
}

function formatUsdAmount(row: WorkbookRecord) {
  if (row.amountUsd === null) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(row.amountUsd);
}

function statementGroup(metric: string) {
  return BALANCE_SHEET_METRICS.has(metric) ? 'Balance Sheet' : 'Profit & Loss';
}

function completeStatementRows(
  selection: WorkbookRecord[],
  group: 'Balance Sheet' | 'Profit & Loss',
  metricCategories: Map<string, string>,
  airline: string,
  year: string,
  period: string,
) {
  const rows = selection.filter((row) => statementGroup(row.metric) === group);
  const presentMetrics = new Set(rows.map((row) => row.metric));
  const missingRows: WorkbookRecord[] = [...metricCategories.entries()]
    .filter(([metric]) => statementGroup(metric) === group && !presentMetrics.has(metric))
    .map(([metric, category]) => ({
      airline,
      metric,
      category,
      amount: null,
      amountUsd: null,
      currency: null,
      unit: null,
      financialYear: year,
      reportingPeriod: period,
      fiscalYearEnd: null,
      date: null,
      status: null,
      reportingScope: null,
      ifrs16Asc842Adoption: null,
      inAdministration: null,
      valueBasis: 'Not reported in supplied workbook',
      reportingEntity: null,
      sourceUrl: null,
      note: 'No matching metric row was supplied for this airline, financial year, and reporting period. This is not a zero value.',
      verificationStatus: 'unavailable',
    }));
  return [...rows, ...missingRows];
}

function StatementTable({
  title,
  rows,
  airline,
  year,
  period,
  emptyText,
}: {
  title: 'Balance Sheet' | 'Profit & Loss';
  rows: WorkbookRecord[];
  airline: string;
  year: string;
  period: string;
  emptyText: string;
}) {
  const download = (format: 'csv' | 'xlsx') => {
    if (format === 'csv') exportStatementCsv(rows, title, airline, year, period);
    else exportStatementXlsx(rows, title, airline, year, period);
  };
  const groupedRows = [...new Set(rows.map((row) => row.category || 'Uncategorised'))]
    .sort((a, b) => {
      const order = CATEGORY_ORDER[title];
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex) || a.localeCompare(b);
    })
    .map((category) => ({ category, rows: rows.filter((row) => (row.category || 'Uncategorised') === category) }));

  return (
    <section className="panel statement-panel" aria-label={title}>
      <div className="statement-panel-head">
        <div>
          <div className="statement-kicker">FINANCIAL STATEMENT</div>
          <h2>{title}</h2>
          <p>{airline} <span>·</span> FY {year} <span>·</span> {period}</p>
        </div>
        <div className="statement-downloads" aria-label={`Download ${title}`}>
          <button className="export-button" type="button" disabled={!rows.length} onClick={() => download('csv')} aria-label={`Download ${title} as CSV`}>
            <FileText size={14} /> CSV
          </button>
          <button className="export-button" type="button" disabled={!rows.length} onClick={() => download('xlsx')} aria-label={`Download ${title} as Excel`}>
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>
      <div className="statement-table-wrap">
        {rows.length ? (
          <table className="statement-table">
            <thead>
              <tr><th>Category</th><th>Metric</th><th className="statement-amount-heading">Total Amount (USD)</th></tr>
            </thead>
            <tbody>
              {groupedRows.map(({ category, rows: categoryRows }) => categoryRows.map((row, index) => (
                <tr key={`${category}-${row.metric}-${row.reportingEntity}-${row.sourceUrl}-${index}`}>
                  {index === 0 && <td className="statement-category-cell" rowSpan={categoryRows.length}><span className="statement-category-icon">−</span>{category}</td>}
                  <td className="statement-metric-cell">
                    <strong>{row.metric}</strong>
                    <span className="statement-value-meta">{row.valueBasis || 'Basis not specified'} · {row.verificationStatus === 'needs_review' ? 'Needs review' : row.verificationStatus}</span>
                    <span className="statement-scope-meta">{row.reportingScope || 'Scope not stated'}{row.reportingEntity ? ` · ${row.reportingEntity}` : ''}</span>
                    {row.sourceUrl
                      ? <a className="statement-source" href={row.sourceUrl} target="_blank" rel="noreferrer" title={row.sourceUrl}>View source ↗</a>
                      : <span className="statement-no-source">No source link</span>}
                    <details className="statement-row-details">
                      <summary>Source &amp; reporting details</summary>
                      <div>{row.status || 'Status not stated'} · {row.fiscalYearEnd || 'Fiscal year-end not stated'} · {row.date || 'Date not stated'}</div>
                      <div>Reported amount: {row.amount === null ? 'Unavailable' : `${row.currency || ''} ${formatAmount(row)}${row.unit ? ` ${row.unit}` : ''}`}</div>
                      {row.ifrs16Asc842Adoption && <div>Lease standard: {row.ifrs16Asc842Adoption}</div>}
                      {row.inAdministration && <div>In administration: {row.inAdministration}</div>}
                      {row.note && <div>{row.note}</div>}
                    </details>
                  </td>
                  <td className="statement-amount">
                    <strong>{formatUsdAmount(row)}</strong>
                    <span>{row.amountUsd === null ? 'USD value unavailable' : `${row.unit || 'Units'} · USD`}</span>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        ) : (
          <div className="statement-empty">{emptyText}</div>
        )}
      </div>
      <div className="statement-panel-foot">
        <span>{rows.length} {rows.length === 1 ? 'line item' : 'line items'}</span>
        <span>Source links and workbook values retained in downloads</span>
      </div>
    </section>
  );
}

export default function FinancialStatementsPage() {
  const [records, setRecords] = useState<WorkbookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [airline, setAirline] = useState('');
  const [year, setYear] = useState('');
  const [period, setPeriod] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/airline-financials.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Workbook data could not be loaded (${response.status}).`);
        return response.json() as Promise<WorkbookRecord[]>;
      })
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data) || data.length !== WORKBOOK_ROW_COUNT) throw new Error('Workbook data failed its row-count check.');
        setRecords(data.map((record) => ({ ...record, verificationStatus: 'needs_review' })));
        setAirline(data[0]?.airline ?? '');
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Workbook data could not be loaded.');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const airlines = useMemo(() => [...new Set(records.map((record) => record.airline))].sort((a, b) => a.localeCompare(b)), [records]);
  const years = useMemo(
    () => [...new Set(records.filter((record) => record.airline === airline).map((record) => record.financialYear))].sort(),
    [airline, records],
  );
  const periods = useMemo(
    () => [...new Set(records.filter((record) => record.airline === airline && record.financialYear === year).map((record) => record.reportingPeriod))]
      .sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b)),
    [airline, records, year],
  );

  useEffect(() => {
    if (!years.includes(year)) setYear(years.includes('2025') ? '2025' : years[0] ?? '');
  }, [year, years]);
  useEffect(() => {
    if (!periods.includes(period)) setPeriod(periods.includes('YR') ? 'YR' : periods[0] ?? '');
  }, [period, periods]);

  const selection = records.filter((record) =>
    record.airline === airline && record.financialYear === year && record.reportingPeriod === period,
  );
  const metricCategories = useMemo(
    () => new Map(records.map((record) => [record.metric, record.category])),
    [records],
  );
  const balanceSheetRows = completeStatementRows(selection, 'Balance Sheet', metricCategories, airline, year, period);
  const profitLossRows = completeStatementRows(selection, 'Profit & Loss', metricCategories, airline, year, period);
  const noSelection = !loading && !error && Boolean(airline && year && period && selection.length === 0);

  return (
    <div className="app-shell">
      <SiteHeader activePage="statements" />
      <main className="page statements-page">
        <div className="statements-hero">
          <div className="eyebrow">Airline financial statements</div>
          <h1>Balance Sheet &amp;<br className="statements-mobile-break" /> Profit &amp; Loss</h1>
          <p>Choose an airline, financial year, and reporting period to view the available statement lines from the supplied workbook.</p>
        </div>

        <section className="panel statements-filters" aria-label="Statement filters">
          <div className="section-heading"><h2>Statement selection</h2><span className="step-number">01 / FILTER</span></div>
          <div className="statement-filter-grid">
            <label className="statement-field">
              <span>Airline</span>
              <select value={airline} onChange={(event) => { setAirline(event.target.value); setYear(''); setPeriod(''); }} disabled={loading || !!error} data-testid="select-statement-airline">
                {airlines.map((name) => <option value={name} key={name}>{name}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Financial year</span>
              <select value={year} onChange={(event) => { setYear(event.target.value); setPeriod(''); }} disabled={loading || !airline} data-testid="select-statement-year">
                {years.map((value) => <option value={value} key={value}>FY {value}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Reporting period</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={loading || !year} data-testid="select-statement-period">
                {periods.map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="statement-caveat"><Info size={15} /><span>Workbook records are displayed as supplied, not independently verified. Some values are derived or use third-party sources; check each linked document and source note before relying on a figure.</span></div>
        </section>

        {loading && <div className="statement-status"><LoaderCircle size={17} className="spin" /> Loading supplied financial workbook…</div>}
        {error && <div className="error-box" role="alert"><AlertCircle size={17} /><div><strong>Workbook data could not be loaded</strong><p>{error}</p></div></div>}
        {!loading && !error && (
          <div className="statements-results" aria-live="polite">
            <div className="statements-results-heading">
              <div><span className="eyebrow">SELECTED REPORTING BASIS</span><h2>{airline || 'Select an airline'} <span>·</span> FY {year || '—'} <span>·</span> {period || '—'}</h2></div>
              <span className="results-count">{selection.length} source rows</span>
            </div>
            {noSelection ? (
              <div className="empty-state"><div className="empty-inner"><div className="empty-icon"><Download size={20} /></div><h3>No matching statement rows</h3><p>There are no workbook lines for this airline, year, and reporting period combination. Choose another period available for this airline.</p></div></div>
            ) : (
              <div className="statement-columns">
                <StatementTable title="Balance Sheet" rows={balanceSheetRows} airline={airline} year={year} period={period} emptyText="No Balance Sheet line items are available for this selection." />
                <StatementTable title="Profit & Loss" rows={profitLossRows} airline={airline} year={year} period={period} emptyText="No Profit & Loss line items are available for this selection." />
              </div>
            )}
            <div className="statements-footnote">Each statement can be downloaded separately as CSV or Excel. Downloads keep amount, currency, unit, reporting scope, source note, and clickable source link.</div>
          </div>
        )}
      </main>
    </div>
  );
}
