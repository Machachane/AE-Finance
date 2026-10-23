import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Info,
  Layers3,
  LineChart as LineChartIcon,
  Scale,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getReportingBases,
  getReportingBasisKey,
  type FinancialRatioRecord,
} from '@/lib/financial-ratios';
import SiteHeader from '@/components/SiteHeader';

type AnalyticsRecord = FinancialRatioRecord & {
  valueBasis?: string | null;
};

type PeriodSnapshot = {
  financialYear: string;
  reportingPeriod: string;
  date: string | null;
  rows: Map<string, AnalyticsRecord[]>;
};

const WORKBOOK_ROW_COUNT = 6358;
const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR'];
const INK = '#18334b';
const TEAL = '#168c87';
const GOLD = '#bb8b45';
const SLATE = '#8192a0';

const FINANCIAL_METRICS = {
  revenue: 'Total Revenue',
  operating: 'Operating Profit/(Loss)',
  ebit: 'EBIT',
  net: 'Profit / Loss After Tax',
  depreciation: 'Depreciation & Amortisation',
  assets: 'Total Assets',
  liabilities: 'Total Liabilities',
  equity: 'Total Equity',
  currentAssets: 'Total Current Assets',
  currentLiabilities: 'Total Current Liabilities',
  cash: 'Cash & Liquid Investments',
  shortDebt: 'Short Term Debt',
  longDebt: 'Long Term Debt & Lease Liabilities',
};

const PERFORMANCE_LINES = [
  { metric: FINANCIAL_METRICS.revenue, label: 'Total revenue', color: TEAL },
  { metric: FINANCIAL_METRICS.operating, label: 'Operating profit / (loss)', color: GOLD },
  { metric: FINANCIAL_METRICS.net, label: 'Profit / (loss) after tax', color: INK },
];

const PERIOD_LABELS: Record<string, string> = {
  Q1: 'Quarter 1', Q2: 'Quarter 2', Q3: 'Quarter 3', Q4: 'Quarter 4',
  H1: 'Half year 1', H2: 'Half year 2', YR: 'Full year',
};

function formatAmount(value: number | null | undefined, currency = 'USD') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
  return [currency, number].filter(Boolean).join(' ');
}

function formatAxis(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return `${value}`;
}

function initialAirlineWithComparableAnnualHistory(records: AnalyticsRecord[]) {
  const airlines = [...new Set(records.map((record) => record.airline))].sort((a, b) => a.localeCompare(b));
  const requiredMetrics = [
    FINANCIAL_METRICS.revenue,
    FINANCIAL_METRICS.operating,
    FINANCIAL_METRICS.net,
    FINANCIAL_METRICS.ebit,
    FINANCIAL_METRICS.depreciation,
  ];

  return airlines.find((airline) =>
    getReportingBases(records, airline).some((basis) => {
      const years = new Map<string, Map<string, AnalyticsRecord[]>>();
      records
        .filter((record) =>
          record.airline === airline &&
          getReportingBasisKey(record) === basis.key &&
          record.reportingPeriod === 'YR',
        )
        .forEach((record) => {
          const metrics = years.get(record.financialYear) ?? new Map<string, AnalyticsRecord[]>();
          const rows = metrics.get(record.metric) ?? [];
          rows.push(record);
          metrics.set(record.metric, rows);
          years.set(record.financialYear, metrics);
        });

      return [...years.values()].filter((metrics) =>
        requiredMetrics.every((metric) => {
          const matchingRows = metrics.get(metric) ?? [];
          return matchingRows.length === 1 && usableAmount(matchingRows[0]) !== null;
        }),
      ).length >= 2;
    }),
  ) ?? records[0]?.airline ?? '';
}

function exactMetric(snapshot: PeriodSnapshot, metric: string): AnalyticsRecord | null {
  const rows = snapshot.rows.get(metric) ?? [];
  return rows.length === 1 ? rows[0] : null;
}

function usableAmount(record: AnalyticsRecord | null) {
  return record && typeof record.amountUsd === 'number' && Number.isFinite(record.amountUsd)
    ? record.amountUsd
    : null;
}

function metricDisplay(snapshot: PeriodSnapshot | undefined, metric: string) {
  if (!snapshot) return { value: null, record: null as AnalyticsRecord | null };
  const record = exactMetric(snapshot, metric);
  return { value: usableAmount(record), record };
}

function SourceLink({ record, label = 'Source document' }: { record: AnalyticsRecord | null; label?: string }) {
  if (!record?.sourceUrl) return <span className="analytics-no-source">No source link supplied</span>;
  return (
    <a className="analytics-source-link" href={record.sourceUrl} target="_blank" rel="noreferrer" data-testid={`link-source-${record.metric.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      {label}<ArrowUpRight size={12} aria-hidden="true" />
    </a>
  );
}

function TraceRows({
  snapshots, metrics, title,
}: {
  snapshots: PeriodSnapshot[];
  metrics: Array<{ metric: string; label: string }>;
  title: string;
}) {
  return (
    <details className="analytics-trace-details">
      <summary>{title}</summary>
      <div className="analytics-trace-list">
        {snapshots.flatMap((snapshot) => metrics.map(({ metric, label }) => {
          const matches = snapshot.rows.get(metric) ?? [];
          const record = exactMetric(snapshot, metric);
          const amount = usableAmount(record);
          return (
            <div className="analytics-trace-row" key={`${snapshot.financialYear}-${snapshot.reportingPeriod}-${metric}`}>
              <div>
                <strong>{label}</strong>
                <span>FY {snapshot.financialYear} · {snapshot.reportingPeriod} · {snapshot.date || 'Date not stated'}</span>
                <span>{matches.length === 1 ? formatAmount(amount) : matches.length ? 'Ambiguous duplicate source rows' : 'No matching source row'}{matches.length === 1 && record?.unit ? ` ${record.unit}` : ''}</span>
                {record?.currency && <span>Source currency: {record.currency}{record.fxBasis ? ` · ${record.fxBasis}` : ''}</span>}
              </div>
              <SourceLink record={record} />
            </div>
          );
        }))}
      </div>
    </details>
  );
}

function ChartTooltip({
  active, payload, label, currency, unit,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; name?: string; color?: string }>;
  label?: string;
  currency: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={`${item.name}-${item.color}`}>
          <i style={{ background: item.color || TEAL }} />
          {item.name}: {formatAmount(typeof item.value === 'number' ? item.value : null, currency)} {unit}
        </span>
      ))}
    </div>
  );
}

function MarginTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={`${item.name}-${item.color}`}>
          <i style={{ background: item.color || TEAL }} />
          {item.name}: {typeof item.value === 'number' ? `${item.value.toFixed(1)}%` : 'Unavailable'}
        </span>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="analytics-loading" aria-label="Loading supplied airline financial workbook" data-testid="status-analytics-loading">
      <div className="analytics-loading-heading" />
      <div className="analytics-loading-cards">{[0, 1, 2].map((item) => <i key={item} />)}</div>
      <div className="analytics-loading-chart" />
    </div>
  );
}

export default function AirlineAnalyticsPage() {
  const [records, setRecords] = useState<AnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [airline, setAirline] = useState('');
  const [basisKey, setBasisKey] = useState('');
  const [period, setPeriod] = useState('YR');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch(`${import.meta.env.BASE_URL}data/airline-financials.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Workbook data could not be loaded (${response.status}).`);
        return response.json() as Promise<AnalyticsRecord[]>;
      })
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data) || data.length !== WORKBOOK_ROW_COUNT) {
          throw new Error('Workbook data failed its 6,358-row integrity check.');
        }
        setRecords(data);
        setAirline(initialAirlineWithComparableAnnualHistory(data));
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Workbook data could not be loaded.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [retryKey]);

  const airlines = useMemo(
    () => [...new Set(records.map((record) => record.airline))].sort((a, b) => a.localeCompare(b)),
    [records],
  );
  const bases = useMemo(() => getReportingBases(records, airline), [records, airline]);
  useEffect(() => {
    if (!bases.some((basis) => basis.key === basisKey)) setBasisKey(bases[0]?.key ?? '');
  }, [bases, basisKey]);

  const basisRows = useMemo(
    () => records.filter((record) => record.airline === airline && getReportingBasisKey(record) === basisKey),
    [records, airline, basisKey],
  );
  const periods = useMemo(
    () => [...new Set(basisRows.map((record) => record.reportingPeriod))]
      .sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b)),
    [basisRows],
  );
  useEffect(() => {
    if (!periods.includes(period)) setPeriod(periods.includes('YR') ? 'YR' : periods[periods.length - 1] ?? '');
  }, [periods, period]);

  const snapshots = useMemo(() => {
    const grouped = new Map<string, AnalyticsRecord[]>();
    basisRows.filter((record) => record.reportingPeriod === period).forEach((record) => {
      const key = JSON.stringify([record.financialYear, record.reportingPeriod]);
      const group = grouped.get(key) ?? [];
      group.push(record);
      grouped.set(key, group);
    });
    return [...grouped.values()].map((rows) => {
      const first = rows[0];
      const metrics = new Map<string, AnalyticsRecord[]>();
      rows.forEach((row) => {
        const metricRows = metrics.get(row.metric) ?? [];
        metricRows.push(row);
        metrics.set(row.metric, metricRows);
      });
      return {
        financialYear: first.financialYear,
        reportingPeriod: first.reportingPeriod,
        date: first.date,
        rows: metrics,
      } satisfies PeriodSnapshot;
    }).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.financialYear.localeCompare(b.financialYear));
  }, [basisRows, period]);

  const basis = bases.find((candidate) => candidate.key === basisKey);
  const firstBasisRow = basisRows[0];
  const currency = 'USD';
  const unit = firstBasisRow?.unit ?? '';
  const latest = snapshots.at(-1);

  const performanceData = useMemo(() => snapshots.map((snapshot) => {
    const point: Record<string, string | number | null> = {
      label: `${snapshot.financialYear} · ${snapshot.reportingPeriod}`,
      financialYear: snapshot.financialYear,
    };
    PERFORMANCE_LINES.forEach(({ metric }) => {
      point[metric] = usableAmount(exactMetric(snapshot, metric));
    });
    return point;
  }), [snapshots]);

  const marginData = useMemo(() => snapshots.map((snapshot) => {
    const revenue = usableAmount(exactMetric(snapshot, FINANCIAL_METRICS.revenue));
    const operating = usableAmount(exactMetric(snapshot, FINANCIAL_METRICS.operating));
    const ebit = usableAmount(exactMetric(snapshot, FINANCIAL_METRICS.ebit));
    const net = usableAmount(exactMetric(snapshot, FINANCIAL_METRICS.net));
    const depreciation = usableAmount(exactMetric(snapshot, FINANCIAL_METRICS.depreciation));
    const margin = (numerator: number | null) => revenue !== null && revenue > 0 && numerator !== null
      ? (numerator / revenue) * 100
      : null;
    return {
      label: `${snapshot.financialYear} · ${snapshot.reportingPeriod}`,
      'Operating margin': margin(operating),
      'EBIT margin': margin(ebit),
      'EBITDA margin': margin(ebit !== null && depreciation !== null ? ebit + depreciation : null),
      'Net margin': margin(net),
    };
  }), [snapshots]);

  const latestRevenue = metricDisplay(latest, FINANCIAL_METRICS.revenue);
  const latestOperating = metricDisplay(latest, FINANCIAL_METRICS.operating);
  const latestNet = metricDisplay(latest, FINANCIAL_METRICS.net);

  const composition = useMemo(() => {
    if (!latest) return [];
    return [
      { metric: 'Passenger Revenue', label: 'Passenger', color: TEAL },
      { metric: 'Cargo Revenue', label: 'Cargo', color: GOLD },
      { metric: 'Other / Unclassified Revenue', label: 'Other / unclassified', color: SLATE },
    ].map((item) => {
      const record = exactMetric(latest, item.metric);
      const value = usableAmount(record);
      return { ...item, value, record };
    }).filter((item) => item.value !== null);
  }, [latest]);

  const balanceSheet = useMemo(() => {
    if (!latest) return [];
    return [
      { metric: FINANCIAL_METRICS.assets, label: 'Total assets' },
      { metric: FINANCIAL_METRICS.liabilities, label: 'Total liabilities' },
      { metric: FINANCIAL_METRICS.equity, label: 'Total equity' },
      { metric: FINANCIAL_METRICS.cash, label: 'Cash & liquid investments' },
      { metric: FINANCIAL_METRICS.currentAssets, label: 'Current assets' },
      { metric: FINANCIAL_METRICS.currentLiabilities, label: 'Current liabilities' },
    ].map((item) => {
      const record = exactMetric(latest, item.metric);
      return { ...item, value: usableAmount(record), record };
    });
  }, [latest]);

  const financialBasisLabel = basis?.label ?? 'No reporting basis selected';
  const periodLabel = PERIOD_LABELS[period] ?? period;

  return (
    <div className="app-shell">
      <SiteHeader activePage="analytics" />
      <main className="page airline-analytics-page">
        <section className="analytics-heading">
          <div className="analytics-heading-copy">
            <div className="eyebrow">AIRLINE ECONOMICS · SOURCE-LINKED ANALYSIS</div>
            <h1>Airline <span>analytics</span></h1>
            <p>A reported-line view of performance, profitability and balance-sheet context. Every figure stays on one selected reporting basis.</p>
          </div>
          <div className="analytics-heading-note">
            <span>WORKBOOK VIEW</span>
            <strong>Matched reporting basis</strong>
            <i>Converted USD amounts · source basis retained</i>
          </div>
        </section>

        <section className="panel analytics-controls" aria-label="Analysis selection">
          <div className="analytics-controls-top">
            <div className="analytics-step"><span>01</span><div><strong>Analysis basis</strong><small>Change the sample without blending reporting definitions.</small></div></div>
            <span className="analytics-row-count" data-testid="text-workbook-record-count">
              {loading ? 'Loading workbook' : `${records.length.toLocaleString()} supplied rows`}
            </span>
          </div>
          <div className="analytics-filter-grid">
            <label className="statement-field">
              <span>Airline</span>
              <select data-testid="select-analytics-airline" value={airline} onChange={(event) => { setAirline(event.target.value); setBasisKey(''); }}>
                {airlines.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Exact reporting basis</span>
              <select data-testid="select-analytics-basis" value={basisKey} onChange={(event) => setBasisKey(event.target.value)} disabled={!bases.length}>
                {bases.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Comparable period</span>
              <select data-testid="select-analytics-period" value={period} onChange={(event) => setPeriod(event.target.value)} disabled={!periods.length}>
                {periods.map((item) => <option key={item} value={item}>{item} · {PERIOD_LABELS[item] ?? 'Reported period'}</option>)}
              </select>
            </label>
          </div>
          <div className="analytics-basis-meta">
            <span><i />{financialBasisLabel}</span>
            <span>{periodLabel} only · fiscal year-end {firstBasisRow?.fiscalYearEnd || 'not stated'}</span>
          </div>
        </section>

        {loading && <LoadingState />}
        {error && (
          <div className="error-box analytics-error" role="alert" data-testid="status-analytics-error">
            <AlertCircle size={18} />
            <div><strong>Workbook data could not be loaded</strong><p>{error}</p></div>
            <button className="retry-button" type="button" data-testid="button-retry-analytics" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div className="analytics-results" aria-live="polite">
            {!snapshots.length ? (
              <section className="panel analytics-empty" data-testid="status-analytics-empty">
                <div className="analytics-empty-mark"><LineChartIcon size={21} /></div>
                <span className="eyebrow">NO MATCHING PERIODS</span>
                <h2>No reported records for this selection</h2>
                <p>The supplied workbook has no records for this airline, reporting basis and period. Unavailable values are not treated as zero.</p>
              </section>
            ) : (
              <>
                <div className="analytics-selection-strip" data-testid="text-analytics-selection">
                  <div><span className="eyebrow">CURRENT SAMPLE</span><strong>{airline}</strong><span>{financialBasisLabel}</span></div>
                  <div className="analytics-sample-period">{snapshots.length} {snapshots.length === 1 ? 'period' : 'periods'} <i /> Latest: FY {latest?.financialYear} · {latest?.reportingPeriod}</div>
                </div>

                <section className="analytics-kpi-grid" aria-label="Latest reported performance">
                  {[
                    { key: 'revenue', eyebrow: 'REPORTED REVENUE', title: 'Total revenue', item: latestRevenue },
                    { key: 'operating', eyebrow: 'OPERATING RESULT', title: 'Operating profit / (loss)', item: latestOperating },
                    { key: 'net', eyebrow: 'AFTER TAX', title: 'Profit / (loss) after tax', item: latestNet },
                  ].map((card) => (
                    <article className={`panel analytics-kpi analytics-kpi-${card.key}`} key={card.key} data-testid={`card-analytics-${card.key}`}>
                      <span className="eyebrow">{card.eyebrow}</span>
                      <strong className="analytics-kpi-value" data-testid={`value-analytics-${card.key}`}>
                        {formatAmount(card.item.value, currency)}{card.item.value !== null && unit ? ` ${unit}` : ''}
                      </strong>
                      <span className="analytics-kpi-title">{card.title}</span>
                      <div className="analytics-kpi-foot">
                        <span>FY {latest?.financialYear} · {period}</span>
                        <SourceLink record={card.item.record} />
                      </div>
                    </article>
                  ))}
                </section>

                <section className="panel analytics-performance-panel">
                  <div className="analytics-panel-heading">
                    <div><span className="eyebrow">02 · REPORTED PERFORMANCE</span><h2>Revenue &amp; earnings through time</h2></div>
                    <span className="analytics-panel-unit">{currency || 'Currency not stated'} · {unit || 'Unit not stated'}</span>
                  </div>
                  <div className="analytics-panel-caption">
                    <span>USD-converted values · {period} periods only</span>
                    <span>Gaps mean a source amount is unavailable or ambiguous</span>
                  </div>
                  {performanceData.length ? (
                    <div className="analytics-chart analytics-performance-chart">
                      <ResponsiveContainer width="100%" height={300} debounce={0}>
                        <LineChart data={performanceData} margin={{ top: 12, right: 18, bottom: 5, left: 0 }}>
                          <CartesianGrid vertical={false} stroke="#e8edf0" strokeDasharray="3 4" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#788b98' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: '#788b98' }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxis} />
                          <Tooltip content={<ChartTooltip currency={currency} unit={unit} />} isAnimationActive={false} cursor={{ stroke: '#aebdc5', strokeDasharray: '3 3' }} />
                          {PERFORMANCE_LINES.map((line) => (
                            <Line key={line.metric} type="linear" dataKey={line.metric} name={line.label} stroke={line.color} strokeWidth={2.4} dot={{ r: 3, fill: line.color, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="analytics-chart-empty">No reported values are available to plot.</div>}
                  <div className="analytics-legend">
                    {PERFORMANCE_LINES.map((line) => <span key={line.metric}><i style={{ background: line.color }} />{line.label}</span>)}
                  </div>
                  <div className="analytics-chart-foot"><Info size={14} /> Charted amounts use the workbook’s converted AMOUNT (USD); source currency and unit remain in the reporting basis. Periods are not annualised.</div>
                  <TraceRows snapshots={snapshots} metrics={PERFORMANCE_LINES.map(({ metric, label }) => ({ metric, label }))} title="Trace every plotted reported line" />
                </section>

                <div className="analytics-two-column">
                  <section className="panel analytics-margin-panel">
                    <div className="analytics-panel-heading">
                      <div><span className="eyebrow">03 · PROFITABILITY</span><h2>Margins, when inputs are present</h2></div>
                      <BarChart3 size={18} className="analytics-heading-icon" />
                    </div>
                    <p className="analytics-section-intro">Derived from matched rows within each year and the selected basis. Missing inputs remain gaps.</p>
                    <div className="analytics-chart analytics-margin-chart">
                      <ResponsiveContainer width="100%" height={250} debounce={0}>
                        <LineChart data={marginData} margin={{ top: 12, right: 14, bottom: 4, left: 0 }}>
                          <CartesianGrid vertical={false} stroke="#e8edf0" strokeDasharray="3 4" />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#788b98' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 10, fill: '#788b98' }} axisLine={false} tickLine={false} width={44} tickFormatter={(value: number) => `${value}%`} />
                          <Tooltip content={<MarginTooltip />} isAnimationActive={false} cursor={{ stroke: '#aebdc5', strokeDasharray: '3 3' }} />
                          <Line type="linear" dataKey="Operating margin" stroke={TEAL} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                          <Line type="linear" dataKey="EBIT margin" stroke={GOLD} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                          <Line type="linear" dataKey="EBITDA margin" stroke={INK} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                          <Line type="linear" dataKey="Net margin" stroke="#8b9eaa" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="analytics-formula-note">
                      <strong>Basis</strong>
                      <span>Operating, EBIT and net margin = reported result ÷ Total Revenue. EBITDA margin = (EBIT + Depreciation &amp; Amortisation) ÷ Total Revenue. Revenue must be positive.</span>
                    </div>
                    <TraceRows
                      snapshots={snapshots}
                      metrics={[
                        { metric: FINANCIAL_METRICS.revenue, label: 'Total Revenue denominator' },
                        { metric: FINANCIAL_METRICS.operating, label: 'Operating Profit/(Loss)' },
                        { metric: FINANCIAL_METRICS.ebit, label: 'EBIT' },
                        { metric: FINANCIAL_METRICS.depreciation, label: 'Depreciation & Amortisation' },
                        { metric: FINANCIAL_METRICS.net, label: 'Profit / Loss After Tax' },
                      ]}
                      title="Trace the exact inputs behind margin trends"
                    />
                    <div className="analytics-margin-legend">
                      <span><i style={{ background: TEAL }} />Operating</span><span><i style={{ background: GOLD }} />EBIT</span><span><i style={{ background: INK }} />EBITDA</span><span><i style={{ background: '#8b9eaa' }} />Net</span>
                    </div>
                  </section>

                  <section className="panel analytics-composition-panel">
                    <div className="analytics-panel-heading">
                      <div><span className="eyebrow">04 · REVENUE MIX</span><h2>Reported revenue lines</h2></div>
                      <Layers3 size={18} className="analytics-heading-icon" />
                    </div>
                    <p className="analytics-section-intro">Latest {period} · FY {latest?.financialYear}. Displayed as supplied; component lines are not assumed to sum to total revenue.</p>
                    {composition.length ? (
                      <div className="analytics-composition-list">
                        {composition.map((item) => (
                          <div className="analytics-composition-row" key={item.metric} data-testid={`row-revenue-mix-${item.metric.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                            <div className="analytics-composition-label"><i style={{ background: item.color }} /><strong>{item.label}</strong><span>{formatAmount(item.value, currency)} {unit}</span></div>
                            <div className="analytics-composition-track"><span style={{ width: `${Math.max(3, (Math.abs(item.value ?? 0) / Math.max(1, ...composition.map((entry) => Math.abs(entry.value ?? 0)))) * 100)}%`, background: item.color }} /></div>
                            <SourceLink record={item.record} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="analytics-inline-empty">No passenger, cargo or other revenue component rows are available for this period.</div>
                    )}
                    <div className="analytics-composition-foot">Scale is relative to the largest available component. No missing line is treated as zero.</div>
                  </section>
                </div>

                <section className="panel analytics-balance-panel">
                  <div className="analytics-panel-heading">
                    <div><span className="eyebrow">05 · BALANCE-SHEET CONTEXT</span><h2>Reported closing position</h2></div>
                    <div className="analytics-asof"><Scale size={15} /> FY {latest?.financialYear} · {latest?.date || 'date not stated'}</div>
                  </div>
                  <div className="analytics-balance-grid">
                    {balanceSheet.map((item) => (
                      <article className="analytics-balance-item" key={item.metric} data-testid={`value-balance-${item.metric.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                        <span>{item.label}</span>
                        <strong>{formatAmount(item.value, currency)}{item.value !== null && unit ? ` ${unit}` : ''}</strong>
                        <SourceLink record={item.record} />
                      </article>
                    ))}
                  </div>
                  <div className="analytics-balance-note">Closing balances are shown as reported. This section is context only; it does not imply a liquidity or solvency assessment.</div>
                </section>

                <section className="analytics-disclosure" data-testid="text-analytics-disclosure">
                  <Info size={16} />
                  <p><strong>Workbook disclosure.</strong> Values are from the supplied workbook and have not been independently verified. Each view uses the selected airline and an exact reporting basis: scope, reporting entity, currency, unit and fiscal year-end. Reporting periods remain distinct; charts compare only the selected period. Derived margins require matched source rows, and each reported figure links to its supplied source document when available.</p>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
