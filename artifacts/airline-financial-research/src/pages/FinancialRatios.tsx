import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Download,
  ExternalLink,
  Info,
  LineChart as LineChartIcon,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
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
import SiteHeader from '@/components/SiteHeader';
import {
  ALL_PERIODS,
  calculateRatioHistory,
  getHealthSignals,
  getReportingBases,
  RATIO_DEFINITIONS,
  type FinancialRatioRecord,
  type IndicatorTone,
  type RatioResult,
  type RatioSnapshot,
} from '@/lib/financial-ratios';

const WORKBOOK_ROW_COUNT = 6358;
const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR'];
const CHART_COLORS = { teal: '#138b89', navy: '#173b58' };
const CATEGORY_ORDER = ['Profitability', 'Returns', 'Leverage', 'Liquidity', 'Cost mix', 'Revenue mix'];

function formatValue(value: number | null, format: RatioResult['format']) {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  return format === 'percent'
    ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)}%`
    : `${new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}×`;
}

function periodLabel(snapshot: RatioSnapshot) {
  return `FY ${snapshot.financialYear} · ${snapshot.reportingPeriod}`;
}

function valueTone(tone: IndicatorTone) {
  return `ratio-tone ratio-tone-${tone}`;
}

function sourceAmount(record: FinancialRatioRecord) {
  if (record.amount === null || !Number.isFinite(record.amount)) return 'Unavailable';
  const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(record.amount);
  return [record.currency, amount, record.unit].filter(Boolean).join(' ');
}

function downloadHistory(history: RatioSnapshot[], airline: string) {
  const headers = [
    'Airline', 'Financial year', 'Reporting period', 'Fiscal year-end', 'Period end', 'Reporting scope',
    'Reporting entity', 'Currency', 'Unit', 'Status', 'IFRS16/ASC842 Adoption',
    'In Administration', 'Ratio', 'Category', 'Value', 'Format',
    'Indicator', 'Formula', 'Calculation note', 'Input metrics', 'Source URLs',
  ];
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = history.flatMap((snapshot) => snapshot.ratios.map((ratio) => [
    snapshot.airline,
    snapshot.financialYear,
    snapshot.reportingPeriod,
    snapshot.fiscalYearEnd,
    snapshot.date,
    snapshot.reportingScope,
    snapshot.reportingEntity,
    snapshot.currency,
    snapshot.unit,
    snapshot.status,
    snapshot.ifrs16Asc842Adoption,
    snapshot.inAdministration,
    ratio.label,
    ratio.category,
    ratio.value,
    ratio.format,
    ratio.indicator.label,
    ratio.formula,
    ratio.note,
    ratio.inputs.map((input) => input.metric).join('; '),
    ratio.inputs.map((input) => input.sourceUrl).filter(Boolean).join('; '),
  ]));
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${airline.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-ratio-history.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; payload?: { chartLabel: string; displayValue: string }; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="ratio-chart-tooltip">
      <strong>{point?.chartLabel}</strong>
      <span><i style={{ background: payload[0]?.color || CHART_COLORS.teal }} />{point?.displayValue || 'Unavailable'}</span>
    </div>
  );
}

function SourceDetails({ result }: { result: RatioResult }) {
  return (
    <details className="ratio-source-details">
      <summary>Trace calculation <ChevronDown size={13} /></summary>
      <div className="ratio-detail-body">
        <p className="ratio-formula"><strong>Formula</strong><span>{result.formula}</span></p>
        {result.note && <p className="ratio-result-note"><Info size={13} />{result.note}</p>}
        {result.inputs.length ? (
          <div className="ratio-input-list">
            <div className="ratio-input-heading">Exact workbook input rows</div>
            {result.inputs.map((input, index) => (
              <div className="ratio-input-row" key={`${input.metric}-${input.date}-${input.sourceUrl}-${index}`}>
                <div className="ratio-input-main">
                  <strong>{input.metric}</strong>
                  <span>{sourceAmount(input)} <i>·</i> FY {input.financialYear} {input.reportingPeriod} <i>·</i> {input.date || 'Date not stated'}</span>
                  {(input.reportingScope || input.reportingEntity) && (
                    <span>{input.reportingScope || 'Scope not stated'}{input.reportingEntity ? ` · ${input.reportingEntity}` : ''}</span>
                  )}
                  {input.note && <span className="ratio-input-note">{input.note}</span>}
                </div>
                {input.sourceUrl ? (
                  <a className="ratio-source-link" href={input.sourceUrl} target="_blank" rel="noreferrer" title={input.sourceUrl}>
                    Source <ExternalLink size={12} />
                  </a>
                ) : <span className="ratio-no-source">No source link</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="ratio-result-note">No matching input rows were supplied for this calculation.</p>
        )}
      </div>
    </details>
  );
}

function SkeletonResults() {
  return (
    <div className="ratio-skeleton-layout" aria-label="Loading financial ratio workbook">
      <div className="ratio-skeleton-chart"><span /><span /><span /><span /></div>
      <div className="ratio-skeleton-table">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
    </div>
  );
}

export default function FinancialRatiosPage() {
  const [records, setRecords] = useState<FinancialRatioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [airline, setAirline] = useState('');
  const [basisKey, setBasisKey] = useState('');
  const [period, setPeriod] = useState(ALL_PERIODS);
  const [selectedRatioId, setSelectedRatioId] = useState('ebitda-margin');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch(`${import.meta.env.BASE_URL}data/airline-financials.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Workbook data could not be loaded (${response.status}).`);
        return response.json() as Promise<FinancialRatioRecord[]>;
      })
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data) || data.length !== WORKBOOK_ROW_COUNT) {
          throw new Error('Workbook data failed its row-count check.');
        }
        setRecords(data);
        setAirline(data[0]?.airline ?? '');
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

  const basisRecords = useMemo(
    () => records.filter((record) => record.airline === airline && bases.some((basis) => basis.key === basisKey)),
    [records, airline, bases, basisKey],
  );
  const periods = useMemo(
    () => [...new Set(basisRecords.filter((record) => {
      const basis = bases.find((candidate) => candidate.key === basisKey);
      return basis && JSON.stringify([
        record.airline, record.reportingScope ?? '', record.reportingEntity ?? '',
        record.currency ?? '', record.unit ?? '', record.fiscalYearEnd ?? '',
      ]) === basis.key;
    }).map((record) => record.reportingPeriod))]
      .sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b)),
    [basisRecords, bases, basisKey],
  );
  useEffect(() => {
    if (period !== ALL_PERIODS && !periods.includes(period)) setPeriod(ALL_PERIODS);
  }, [period, periods]);

  const history = useMemo(
    () => basisKey ? calculateRatioHistory(records, airline, basisKey, period) : [],
    [records, airline, basisKey, period],
  );
  const latest = history.at(-1);
  const chartRatio = RATIO_DEFINITIONS.find((definition) => definition.id === selectedRatioId) ?? RATIO_DEFINITIONS[0];
  const chartData = history.map((snapshot) => {
    const result = snapshot.ratios.find((ratio) => ratio.id === chartRatio.id);
    return {
      chartLabel: periodLabel(snapshot),
      value: result?.value ?? null,
      displayValue: result ? formatValue(result.value, result.format) : 'Unavailable',
    };
  });
  const currentSignals = latest ? getHealthSignals(latest) : [];
  const groupedRatios = CATEGORY_ORDER.map((category) => ({
    category,
    ratios: latest?.ratios.filter((ratio) => ratio.category === category) ?? [],
  })).filter((group) => group.ratios.length);

  const basisLabel = bases.find((basis) => basis.key === basisKey)?.label ?? 'Select a reporting basis';
  const dataPeriodLabel = period === ALL_PERIODS ? 'All available periods' : period;

  return (
    <div className="app-shell">
      <SiteHeader activePage="ratios" />
      <main className="page ratios-page">
        <section className="ratios-heading">
          <div>
            <div className="eyebrow">AIRLINE ECONOMICS · ANALYSIS WORKSPACE</div>
            <h1>Financial ratios <span>&amp;</span> KPIs</h1>
            <p>Derived measures, tied back to the reported lines and reporting basis that produced them.</p>
          </div>
          <div className="ratio-heading-stamp"><span>WORKBOOK VIEW</span><strong>Source-first analysis</strong><i>Selected airline · matched basis · traceable inputs</i></div>
        </section>

        <section className="panel ratios-selection" aria-label="Ratio selection">
          <div className="ratio-section-head">
            <div><span className="ratio-step">01</span><h2>Define the reporting basis</h2></div>
            <span className="ratio-row-count">{loading ? 'Loading workbook' : `${records.length.toLocaleString()} workbook rows`}</span>
          </div>
          <div className="ratio-filter-grid">
            <label className="statement-field">
              <span>Airline</span>
              <select value={airline} onChange={(event) => { setAirline(event.target.value); setBasisKey(''); setPeriod(ALL_PERIODS); }} disabled={loading || !!error}>
                {airlines.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Reporting basis</span>
              <select value={basisKey} onChange={(event) => { setBasisKey(event.target.value); setPeriod(ALL_PERIODS); }} disabled={loading || !bases.length || !!error}>
                {bases.map((basis) => <option key={basis.key} value={basis.key}>{basis.label}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Reporting period</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={loading || !periods.length || !!error}>
                <option value={ALL_PERIODS}>All available periods</option>
                {periods.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="ratio-selection-meta">
            <span><i className="ratio-meta-dot" />Basis locked to {basisLabel}</span>
            <span>Period selection: {dataPeriodLabel}</span>
          </div>
        </section>

        {loading && <SkeletonResults />}
        {error && (
          <div className="error-box ratio-error" role="alert">
            <AlertCircle size={18} />
            <div><strong>Workbook data could not be loaded</strong><p>{error}</p></div>
            <button className="retry-button" type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div className="ratios-results" aria-live="polite">
            {!history.length || !latest ? (
              <div className="ratio-empty panel">
                <div className="ratio-empty-icon"><LineChartIcon size={21} /></div>
                <span className="eyebrow">NO MATCHING SNAPSHOTS</span>
                <h2>No ratio history for this selection</h2>
                <p>The supplied workbook has no matching records for this airline and reporting basis. This does not indicate zero financial values.</p>
              </div>
            ) : (
              <>
                <div className="ratio-context-bar">
                  <div><span className="eyebrow">SELECTED HISTORY</span><strong>{airline}</strong><span>{basisLabel}</span></div>
                  <div className="ratio-context-period"><span>{history.length} snapshots</span><i />Latest: {periodLabel(latest)}</div>
                </div>

                <div className="ratio-overview-grid">
                  <section className="panel ratio-chart-panel">
                    <div className="ratio-panel-head">
                      <div><span className="eyebrow">HISTORICAL TREND</span><h2>{chartRatio.label}</h2></div>
                      <label className="ratio-chart-select">
                        <span className="sr-only">Chart ratio</span>
                        <select value={selectedRatioId} onChange={(event) => setSelectedRatioId(event.target.value)}>
                          {RATIO_DEFINITIONS.map((ratio) => <option key={ratio.id} value={ratio.id}>{ratio.label}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="ratio-chart-subhead">
                      <span>{chartRatio.category} <i>·</i> {chartRatio.format === 'percent' ? 'Percent' : 'Multiple'}</span>
                      <span>Gaps indicate unavailable inputs</span>
                    </div>
                    {chartData.length > 0 ? (
                      <div className="ratio-chart">
                        <ResponsiveContainer width="100%" height={274} debounce={0}>
                          <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 3, left: 0 }}>
                            <CartesianGrid vertical={false} stroke="#e7edf0" strokeDasharray="3 4" />
                            <XAxis dataKey="chartLabel" tick={{ fontSize: 10, fill: '#788a98' }} stroke="#d8e1e6" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis
                              tick={{ fontSize: 10, fill: '#788a98' }}
                              stroke="#d8e1e6"
                              tickLine={false}
                              axisLine={false}
                              width={52}
                              tickFormatter={(value: number) => chartRatio.format === 'percent' ? `${value}%` : `${value.toFixed(1)}×`}
                            />
                            <Tooltip content={<ChartTooltip />} isAnimationActive={false} cursor={{ stroke: '#9cafb8', strokeDasharray: '3 3' }} />
                            <Line
                              type="linear"
                              dataKey="value"
                              name={chartRatio.label}
                              stroke={CHART_COLORS.teal}
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: CHART_COLORS.teal, stroke: '#fff', strokeWidth: 1.5 }}
                              activeDot={{ r: 5, fill: CHART_COLORS.teal, stroke: '#fff', strokeWidth: 2 }}
                              connectNulls={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : <div className="ratio-chart-empty">No values available to plot for this measure.</div>}
                    <div className="ratio-chart-foot"><span>Periods may differ in length; compare like-for-like selections.</span><span>Formula: {chartRatio.formula}</span></div>
                  </section>

                  <aside className="panel ratio-health-panel">
                    <div className="ratio-panel-head">
                      <div><span className="eyebrow">FINANCIAL HEALTH</span><h2>Signals in the latest period</h2></div>
                      <span className="ratio-period-pill">{periodLabel(latest)}</span>
                    </div>
                    <div className="ratio-health-body">
                      {currentSignals.length ? currentSignals.map((signal, index) => (
                        <div className={`ratio-health-signal ratio-health-${signal.tone}`} key={`${signal.label}-${index}`}>
                          <span className="ratio-health-icon">{signal.tone === 'attention' ? <ShieldAlert size={16} /> : <TriangleAlert size={16} />}</span>
                          <div><strong>{signal.label}</strong><p>{signal.detail}</p></div>
                        </div>
                      )) : (
                        <div className="ratio-no-signals">
                          <ShieldCheck size={19} />
                          <div><strong>No defined threshold signals</strong><p>No listed alert condition is triggered by the available latest-period ratios. This is not a comprehensive solvency assessment.</p></div>
                        </div>
                      )}
                      <div className="ratio-disclosures">
                        <div><span>Reported status</span><strong>{latest.status || 'Not stated'}</strong></div>
                        <div><span>IFRS 16 / ASC 842</span><strong>{latest.ifrs16Asc842Adoption || 'Not stated'}</strong></div>
                        <div><span>Administration</span><strong>{latest.inAdministration || 'Not stated'}</strong></div>
                      </div>
                    </div>
                    <div className="ratio-health-foot">Signals are rule-based observations from supplied values, not a credit rating or investment recommendation.</div>
                  </aside>
                </div>

                <section className="panel ratio-table-panel">
                  <div className="ratio-table-head">
                    <div><span className="eyebrow">02 · DERIVED MEASURES</span><h2>Ratios &amp; KPIs <span>·</span> {periodLabel(latest)}</h2></div>
                    <button className="ratio-download" type="button" onClick={() => downloadHistory(history, airline)} disabled={!history.length}>
                      <Download size={14} /> Download history CSV
                    </button>
                  </div>
                  <div className="ratio-table-subhead">
                    <span>Each result uses exact-match inputs from the selected reporting basis.</span>
                    <span>{latest.currency || 'Currency not stated'} {latest.unit || ''} · FY-end {latest.fiscalYearEnd || 'not stated'}</span>
                  </div>
                  <div className="ratio-results-groups">
                    {groupedRatios.map((group) => (
                      <div className="ratio-category-group" key={group.category}>
                        <div className="ratio-category-label">{group.category}<span>{group.ratios.length} measures</span></div>
                        <div className="ratio-results-list">
                          {group.ratios.map((ratio) => (
                            <article className="ratio-result-row" key={ratio.id}>
                              <div className="ratio-result-name">
                                <strong>{ratio.label}</strong>
                                <span>{ratio.formula}</span>
                              </div>
                              <div className="ratio-result-value">
                                <strong className={ratio.value !== null && ratio.value < 0 ? 'ratio-negative' : ''}>{formatValue(ratio.value, ratio.format)}</strong>
                                <span className={valueTone(ratio.indicator.tone)}>{ratio.indicator.label}</span>
                              </div>
                              <SourceDetails result={ratio} />
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="ratio-footnote">
                    <Info size={15} />
                    <p>Values are derived from the supplied workbook and are not independently verified. Missing reported inputs remain unavailable, never zero. Returns use average balances and are not annualised; interim-period EBITDA multiples are also not annualised. Review each calculation’s input rows, source links and notes before relying on a result.</p>
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
