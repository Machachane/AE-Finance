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
  buildRatioTrendPoints,
  calculateRatioHistory,
  getHealthSignals,
  getReportingBasisKey,
  getReportingBases,
  RATIO_DEFINITIONS,
  type FinancialRatioRecord,
  type IndicatorTone,
  type RatioResult,
  type RatioSnapshot,
} from '@/lib/financial-ratios';

const WORKBOOK_ROW_COUNT = 6358;
const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR'];
const CHART_COLORS = ['#2fc2b4', '#3b82e6', '#f07f33'];
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

function downloadHistory(histories: RatioSnapshot[][], airlines: string[]) {
  const headers = [
    'Airline', 'Financial year', 'Reporting period', 'Fiscal year-end', 'Period end', 'Reporting scope',
    'Reporting entity', 'Currency', 'Unit', 'Status', 'IFRS16/ASC842 Adoption',
    'In Administration', 'Ratio', 'Category', 'Value', 'Format',
    'Indicator', 'Formula', 'Calculation note', 'Input metrics', 'Input values', 'Source URLs',
  ];
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = histories.flatMap((history) => history.flatMap((snapshot) => snapshot.ratios.map((ratio) => [
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
    ratio.inputs.map((input) => `${input.metric}: ${input.amount === null || !Number.isFinite(input.amount) ? 'Unavailable' : `${input.amount}${input.unit ? ` ${input.unit}` : ''}`}`).join('; '),
    ratio.inputs.map((input) => input.sourceUrl).filter(Boolean).join('; '),
  ])));
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  const blobUrl = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  const filenameAirline = airlines[0]?.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'airline';
  anchor.download = `${filenameAirline}-ratio-${airlines.length > 1 ? 'comparison' : 'history'}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function ChartTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; payload?: { chartLabel: string }; color?: string; name?: string }>;
  format: RatioResult['format'];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="ratio-chart-tooltip">
      <strong>{point?.chartLabel}</strong>
      {payload.map((item, index) => (
        <span key={`${item.name || 'airline'}-${index}`}>
          <i style={{ background: item.color || CHART_COLORS[0] }} />
          {item.name ? `${item.name}: ` : ''}{formatValue(item.value ?? null, format)}
        </span>
      ))}
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
                  <span>Currency: {input.currency || 'Not stated'}</span>
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
  const [comparedAirlines, setComparedAirlines] = useState<string[]>(['', '']);
  const [comparisonBasisKeys, setComparisonBasisKeys] = useState<Record<string, string>>({});
  const [basisKey, setBasisKey] = useState('');
  const [period, setPeriod] = useState(ALL_PERIODS);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
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
        const params = new URLSearchParams(window.location.search);
        const requestedAirline = params.get('airline');
        const matchedAirline = requestedAirline
          ? [...new Set(data.map((record) => record.airline))].find((name) => name.toLocaleLowerCase() === requestedAirline.toLocaleLowerCase())
          : undefined;
        setAirline(matchedAirline ?? data[0]?.airline ?? '');
        const requestedComparisons = new URLSearchParams(window.location.search)
          .getAll('compare')
          .map((name) => [...new Set(data.map((record) => record.airline))].find((available) => available.toLocaleLowerCase() === name.toLocaleLowerCase()))
          .filter((name): name is string => Boolean(name) && name !== matchedAirline)
          .slice(0, 2);
        if (requestedComparisons.length) {
          setComparedAirlines([...requestedComparisons, ...Array(Math.max(0, 2 - requestedComparisons.length)).fill('')]);
        }
        const requestedRatio = params.get('ratio');
        if (requestedRatio && RATIO_DEFINITIONS.some((definition) => definition.id === requestedRatio)) {
          setSelectedRatioId(requestedRatio);
        }
        const requestedPeriod = params.get('period');
        if (requestedPeriod && data.some((record) => record.reportingPeriod.toLocaleLowerCase() === requestedPeriod.toLocaleLowerCase())) {
          setPeriod(data.find((record) => record.reportingPeriod.toLocaleLowerCase() === requestedPeriod.toLocaleLowerCase())!.reportingPeriod);
        }
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
  const selectedAirlines = useMemo(
    () => [...new Set([airline, ...comparedAirlines].filter(Boolean))],
    [airline, comparedAirlines],
  );
  const bases = useMemo(() => getReportingBases(records, airline), [records, airline]);
  useEffect(() => {
    if (!bases.some((basis) => basis.key === basisKey)) setBasisKey(bases[0]?.key ?? '');
  }, [bases, basisKey]);

  const basisOptionsByAirline = useMemo(
    () => Object.fromEntries(selectedAirlines.map((name) => [
      name,
      name === airline ? bases : getReportingBases(records, name),
    ])),
    [records, selectedAirlines, airline, bases],
  );
  const basisKeysByAirline = useMemo(
    () => Object.fromEntries(selectedAirlines.map((name) => {
      const options = basisOptionsByAirline[name] ?? [];
      const requestedKey = name === airline ? basisKey : comparisonBasisKeys[name];
      const key = options.some((basis) => basis.key === requestedKey) ? requestedKey : options[0]?.key ?? '';
      return [name, key];
    })),
    [selectedAirlines, basisOptionsByAirline, airline, basisKey, comparisonBasisKeys],
  );

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
  const periodsBySelectedBasis = useMemo(
    () => selectedAirlines.map((name) => new Set(records
      .filter((record) => record.airline === name && getReportingBasisKey(record) === basisKeysByAirline[name])
      .map((record) => record.reportingPeriod))),
    [records, selectedAirlines, basisKeysByAirline],
  );
  const sharedPeriods = useMemo(
    () => periods.filter((value) => periodsBySelectedBasis.every((available) => available.has(value))),
    [periods, periodsBySelectedBasis],
  );
  const periodOptions = selectedAirlines.length > 1 && sharedPeriods.length ? sharedPeriods : periods;
  const hasSharedPeriod = selectedAirlines.length <= 1 || sharedPeriods.length > 0;
  useEffect(() => {
    if (deepLinkApplied || loading) return;
    const requestedPeriod = new URLSearchParams(window.location.search).get('period');
    if (requestedPeriod && !periodOptions.length) return;
    const matchingPeriod = requestedPeriod && periodOptions.find((value) => value.toLocaleLowerCase() === requestedPeriod.toLocaleLowerCase());
    if (matchingPeriod) setPeriod(matchingPeriod);
    setDeepLinkApplied(true);
  }, [deepLinkApplied, loading, periodOptions]);
  useEffect(() => {
    if (period !== ALL_PERIODS && !periodOptions.includes(period)) setPeriod(ALL_PERIODS);
  }, [period, periodOptions]);

  const comparisonSeries = useMemo(
    () => selectedAirlines.map((name, index) => {
      const selectedBasisKey = basisKeysByAirline[name] ?? '';
      const basis = (basisOptionsByAirline[name] ?? []).find((option) => option.key === selectedBasisKey);
      return {
        key: `series-${index}`,
        airline: name,
        basisKey: selectedBasisKey,
        basisLabel: basis?.label ?? 'No reporting basis',
        history: selectedBasisKey ? calculateRatioHistory(records, name, selectedBasisKey, period) : [],
      };
    }),
    [records, selectedAirlines, basisKeysByAirline, basisOptionsByAirline, period],
  );
  const history = comparisonSeries[0]?.history ?? [];
  const latest = history.at(-1);
  const chartRatio = RATIO_DEFINITIONS.find((definition) => definition.id === selectedRatioId) ?? RATIO_DEFINITIONS[0];
  const chartData = useMemo(
    () => buildRatioTrendPoints(comparisonSeries, chartRatio.id),
    [comparisonSeries, chartRatio.id],
  );
  const hasAnyHistory = comparisonSeries.some((series) => series.history.length > 0);
  const groupedRatios = CATEGORY_ORDER.map((category) => ({
    category,
    ratios: latest?.ratios.filter((ratio) => ratio.category === category) ?? [],
  })).filter((group) => group.ratios.length);
  const comparisonRatioGroups = CATEGORY_ORDER.map((category) => ({
    category,
    ratios: RATIO_DEFINITIONS.filter((ratio) => ratio.category === category),
  })).filter((group) => group.ratios.length);

  const basisLabel = bases.find((basis) => basis.key === basisKey)?.label ?? 'Select a reporting basis';
  const dataPeriodLabel = period === ALL_PERIODS ? 'All available periods' : period;
  const updateComparisonAirline = (slot: number, name: string) => {
    setComparedAirlines((current) => {
      const next = [...current];
      next[slot] = name;
      return next;
    });
    if (name) {
      const defaultKey = getReportingBases(records, name)[0]?.key ?? '';
      setComparisonBasisKeys((current) => ({ ...current, [name]: current[name] || defaultKey }));
    }
    setPeriod(ALL_PERIODS);
  };

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
          <div className="ratio-heading-stamp"><span>WORKBOOK VIEW</span><strong>Source-first analysis</strong><i>Selected airline(s) · matched bases · traceable inputs</i></div>
        </section>

        <section className="panel ratios-selection" aria-label="Ratio selection">
          <div className="ratio-section-head">
            <div><span className="ratio-step">01</span><h2>Define the reporting basis</h2></div>
            <span className="ratio-row-count">{loading ? 'Loading workbook' : `${selectedAirlines.length} / 3 airlines selected`}</span>
          </div>
          <div className="ratio-filter-grid">
            <label className="statement-field">
              <span>Airline</span>
              <select value={airline} onChange={(event) => {
                const nextAirline = event.target.value;
                setAirline(nextAirline);
                setBasisKey('');
                setComparedAirlines((current) => current.map((name) => name === nextAirline ? '' : name));
                setPeriod(ALL_PERIODS);
              }} disabled={loading || !!error} data-testid="select-ratio-airline">
                {airlines.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Reporting basis</span>
              <select value={basisKey} onChange={(event) => { setBasisKey(event.target.value); setPeriod(ALL_PERIODS); }} disabled={loading || !bases.length || !!error} data-testid="select-primary-reporting-basis">
                {bases.map((basis) => <option key={basis.key} value={basis.key}>{basis.label}</option>)}
              </select>
            </label>
            <label className="statement-field">
              <span>Reporting period</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={loading || !periodOptions.length || !!error} data-testid="select-ratio-period">
                <option value={ALL_PERIODS}>All available periods</option>
                {periodOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            {comparedAirlines.map((name, slot) => {
              const unavailableNames = new Set([airline, ...comparedAirlines.filter((_, index) => index !== slot)].filter(Boolean));
              return (
                <label className="statement-field" key={`compare-slot-${slot}`}>
                  <span>{slot === 0 ? 'Compare with (optional)' : 'Another airline (optional)'}</span>
                  <select
                    value={name}
                    onChange={(event) => updateComparisonAirline(slot, event.target.value)}
                    disabled={loading || !!error}
                    data-testid={`select-compare-airline-${slot + 1}`}
                  >
                    <option value="">No comparison</option>
                    {airlines.filter((candidate) => !unavailableNames.has(candidate)).map((candidate) => (
                      <option key={candidate} value={candidate}>{candidate}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          {selectedAirlines.length > 1 && (
            <div className="ratio-comparison-bases">
              <div className="ratio-comparison-bases-heading">
                <strong>Reporting bases for comparison airlines</strong>
                <span>Each airline keeps its own source basis.</span>
              </div>
              <div className="ratio-comparison-basis-grid">
                {selectedAirlines.slice(1).map((name) => {
                  const options = basisOptionsByAirline[name] ?? [];
                  const selectedKey = basisKeysByAirline[name] ?? '';
                  return (
                    <label className="statement-field" key={`basis-${name}`}>
                      <span>{name}</span>
                      <select
                        value={selectedKey}
                        onChange={(event) => {
                          setComparisonBasisKeys((current) => ({ ...current, [name]: event.target.value }));
                          setPeriod(ALL_PERIODS);
                        }}
                        disabled={!options.length || !!error}
                        data-testid={`select-comparison-basis-${selectedAirlines.indexOf(name)}`}
                      >
                        {options.map((basis) => <option key={basis.key} value={basis.key}>{basis.label}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div className="ratio-selection-meta">
            <span><i className="ratio-meta-dot" />{selectedAirlines.length > 1 ? 'Reporting basis selected for each airline' : `Basis locked to ${basisLabel}`}</span>
            <span>Period selection: {dataPeriodLabel}</span>
          </div>
          {selectedAirlines.length > 1 && (
            <div className="ratio-comparison-notice" role="status">
              {hasSharedPeriod
                ? `Comparing up to ${selectedAirlines.length} airlines. Shared period options are aligned where available; missing values remain gaps. Ratios are calculated within each airline’s original reporting basis.`
                : 'No reporting period is shared across the selected bases. Each airline’s available periods are shown separately; use the period labels before comparing.'}
            </div>
          )}
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
            {!hasAnyHistory ? (
              <div className="ratio-empty panel">
                <div className="ratio-empty-icon"><LineChartIcon size={21} /></div>
                <span className="eyebrow">NO MATCHING SNAPSHOTS</span>
                <h2>No ratio history for these selections</h2>
                <p>The supplied workbook has no matching records for the selected airline reporting bases and period. This does not indicate zero financial values.</p>
              </div>
            ) : (
              <>
                <div className="ratio-context-bar">
                  <div>
                    <span className="eyebrow">{selectedAirlines.length > 1 ? 'SIDE-BY-SIDE HISTORY' : 'SELECTED HISTORY'}</span>
                    <strong>{selectedAirlines.length > 1 ? `${selectedAirlines.length} airlines` : airline}</strong>
                    <span>{selectedAirlines.length > 1 ? 'Each airline shown on its selected reporting basis' : basisLabel}</span>
                  </div>
                  <div className="ratio-context-period">
                    <span>{comparisonSeries.filter((series) => series.history.length).length} / {selectedAirlines.length} histories available</span>
                    {latest && <><i />Latest: {periodLabel(latest)}</>}
                  </div>
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
                            <CartesianGrid vertical={false} stroke="#24384d" strokeDasharray="3 4" />
                            <XAxis dataKey="chartLabel" tick={{ fontSize: 10, fill: '#a9bccb' }} stroke="#2c4258" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis
                              tick={{ fontSize: 10, fill: '#a9bccb' }}
                              stroke="#2c4258"
                              tickLine={false}
                              axisLine={false}
                              width={52}
                              tickFormatter={(value: number) => chartRatio.format === 'percent' ? `${value}%` : `${value.toFixed(1)}×`}
                            />
                            <Tooltip content={<ChartTooltip format={chartRatio.format} />} isAnimationActive={false} cursor={{ stroke: '#5d7890', strokeDasharray: '3 3' }} />
                            {comparisonSeries.map((series, index) => (
                              <Line
                                key={series.key}
                                type="linear"
                                dataKey={series.key}
                                name={series.airline}
                                stroke={CHART_COLORS[index]}
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: CHART_COLORS[index], stroke: '#fff', strokeWidth: 1.5 }}
                                activeDot={{ r: 5, fill: CHART_COLORS[index], stroke: '#fff', strokeWidth: 2 }}
                                connectNulls={false}
                                isAnimationActive={false}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : <div className="ratio-chart-empty">No values available to plot for this measure.</div>}
                    {selectedAirlines.length > 1 && (
                      <div className="ratio-comparison-legend">
                        {comparisonSeries.map((series, index) => (
                          <div key={series.key}>
                            <i style={{ background: CHART_COLORS[index] }} />
                            <span><strong>{series.airline}</strong><small>{series.basisLabel}{series.history.at(-1)?.fiscalYearEnd ? ` · FY-end ${series.history.at(-1)?.fiscalYearEnd}` : ''}</small></span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ratio-chart-foot"><span>Periods may differ in length; compare like-for-like selections.</span><span>Formula: {chartRatio.formula}</span></div>
                  </section>

                  <aside className="panel ratio-health-panel">
                    <div className="ratio-panel-head">
                      <div><span className="eyebrow">FINANCIAL HEALTH</span><h2>Latest-period signals</h2></div>
                    </div>
                    <div className="ratio-health-body">
                      {comparisonSeries.map((series) => {
                        const snapshot = series.history.at(-1);
                        const signals = snapshot ? getHealthSignals(snapshot) : [];
                        return (
                          <section className="ratio-health-airline" key={series.key}>
                            <div className="ratio-health-airline-heading">
                              <strong>{series.airline}</strong>
                              <span>{snapshot ? periodLabel(snapshot) : 'No matching snapshot'}</span>
                            </div>
                            {snapshot ? (
                              <>
                                {signals.length ? signals.map((signal, index) => (
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
                                  <div><span>Reported status</span><strong>{snapshot.status || 'Not stated'}</strong></div>
                                  <div><span>IFRS 16 / ASC 842</span><strong>{snapshot.ifrs16Asc842Adoption || 'Not stated'}</strong></div>
                                  <div><span>Administration</span><strong>{snapshot.inAdministration || 'Not stated'}</strong></div>
                                </div>
                              </>
                            ) : (
                              <p className="ratio-health-missing">No matching records for this airline, reporting basis, and period selection.</p>
                            )}
                          </section>
                        );
                      })}
                    </div>
                    <div className="ratio-health-foot">Signals are rule-based observations from supplied values, not a credit rating or investment recommendation.</div>
                  </aside>
                </div>

                <section className="panel ratio-table-panel">
                  <div className="ratio-table-head">
                    <div><span className="eyebrow">02 · DERIVED MEASURES</span><h2>{selectedAirlines.length > 1 ? 'Side-by-side ratios & KPIs' : 'Ratios & KPIs'} {selectedAirlines.length === 1 && latest && <><span>·</span> {periodLabel(latest)}</>}</h2></div>
                    <button
                      className="ratio-download"
                      type="button"
                      onClick={() => downloadHistory(comparisonSeries.map((series) => series.history), selectedAirlines)}
                      disabled={!hasAnyHistory}
                      data-testid="button-download-ratio-history"
                    >
                      <Download size={14} /> {selectedAirlines.length > 1 ? 'Download comparison CSV' : 'Download history CSV'}
                    </button>
                  </div>
                  <div className="ratio-table-subhead">
                    <span>{selectedAirlines.length > 1 ? 'Latest available snapshot per airline; period and basis are shown in each column.' : 'Each result uses exact-match inputs from the selected reporting basis.'}</span>
                    {selectedAirlines.length === 1 && latest && <span>Currency: {latest.currency || 'not stated'} · {latest.unit || 'unit not stated'} · FY-end {latest.fiscalYearEnd || 'not stated'}</span>}
                  </div>
                  {selectedAirlines.length > 1 ? (
                    <div className="ratio-comparison-table-wrap">
                      <table className="ratio-comparison-table">
                        <thead>
                          <tr>
                            <th scope="col">Ratio / KPI</th>
                            {comparisonSeries.map((series) => {
                              const snapshot = series.history.at(-1);
                              return (
                                <th scope="col" key={series.key}>
                                  <strong>{series.airline}</strong>
                                  <span>{snapshot ? periodLabel(snapshot) : 'No matching snapshot'}</span>
                                  <small>{series.basisLabel}{snapshot?.fiscalYearEnd ? ` · FY-end ${snapshot.fiscalYearEnd}` : ' · FY-end not stated'}</small>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        {comparisonRatioGroups.map((group) => (
                          <tbody key={group.category}>
                            <tr className="ratio-comparison-category"><th colSpan={comparisonSeries.length + 1} scope="colgroup">{group.category}</th></tr>
                            {group.ratios.map((definition) => (
                              <tr key={definition.id}>
                                <th scope="row"><strong>{definition.label}</strong><small>{definition.formula}</small></th>
                                {comparisonSeries.map((series) => {
                                  const result = series.history.at(-1)?.ratios.find((ratio) => ratio.id === definition.id);
                                  return (
                                    <td key={`${series.key}-${definition.id}`}>
                                      <strong className={result?.value !== null && result?.value !== undefined && result.value < 0 ? 'ratio-negative' : ''}>
                                        {result ? formatValue(result.value, result.format) : 'Unavailable'}
                                      </strong>
                                      <span className={valueTone(result?.indicator.tone ?? 'unavailable')}>{result?.indicator.label ?? 'Unavailable'}</span>
                                      {result && <SourceDetails result={result} />}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        ))}
                      </table>
                    </div>
                  ) : (
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
                  )}
                  <div className="ratio-footnote">
                    <Info size={15} />
                    <p>Values are derived from the supplied workbook’s original AMOUNT values within the selected currency and unit; no currency conversion is applied. Missing source values remain unavailable, never zero. Review each calculation’s input values, source links and notes before relying on a result. Returns use average balances and are not annualised; interim-period EBITDA multiples are also not annualised.</p>
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
