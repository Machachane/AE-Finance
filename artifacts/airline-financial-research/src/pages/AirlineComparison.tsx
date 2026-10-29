import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownWideNarrow, Check, ChevronDown, ExternalLink, Info, Search, ShieldCheck, SlidersHorizontal,
} from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import {
  buildAirlineComparison, getAvailableComparisonPeriods, getBasisOptions, getComparisonScopes,
  type AirlineComparisonRow, type ComparisonDimension,
} from '@/lib/airline-comparison';
import { type FinancialRatioRecord, type RatioResult } from '@/lib/financial-ratios';

const EXPECTED_ROWS = 6358;
type Classification = { airline: string; region?: string; businessModel?: string; airlineType?: string; airlineSize?: string; ownership?: string; airlineGroup?: string; sourceUrl?: string; verificationStatus?: string };
type ComparisonRecord = FinancialRatioRecord & { metric: string };
const CLASSIFICATION_FACETS: Array<{ field: keyof Classification; label: string }> = [
  { field: 'region', label: 'Region' },
  { field: 'businessModel', label: 'Business model' },
  { field: 'airlineType', label: 'Airline type' },
  { field: 'airlineSize', label: 'Airline size' },
  { field: 'ownership', label: 'Ownership' },
  { field: 'airlineGroup', label: 'Airline group' },
];
const METRICS: Array<{ id: ComparisonDimension; title: string; measure: string; direction: string }> = [
  { id: 'profitability', title: 'Profitability', measure: 'EBITDA margin', direction: 'Higher is stronger' },
  { id: 'leverage', title: 'Leverage', measure: 'Debt / equity', direction: 'Lower is stronger' },
  { id: 'liquidity', title: 'Liquidity', measure: 'Current ratio', direction: 'Higher is stronger' },
  { id: 'revenueGrowth', title: 'Revenue growth', measure: 'Total Revenue · YoY', direction: 'Higher is stronger' },
  { id: 'financialStability', title: 'Financial stability', measure: 'Observed positive signals', direction: 'Higher is stronger' },
];

function formatMetricValue(row: AirlineComparisonRow, dimension: ComparisonDimension) {
  const value = row.rankings[dimension].value;
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  if (dimension === 'profitability' || dimension === 'revenueGrowth') return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  if (dimension === 'financialStability') return `${value} / 4`;
  return `${value.toFixed(2)}×`;
}

function metricCoverage(row: AirlineComparisonRow, dimension: ComparisonDimension) {
  if (dimension === 'financialStability') return `${row.stabilitySignalsAvailable} / 4 signals`;
  return row.rankings[dimension].value === null ? '0 / 1 observed' : '1 / 1 observed';
}

function Skeleton() {
  return <div className="comparison-skeleton" aria-label="Loading comparison workbook">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>;
}

function BasisSource({ ratio }: { ratio: RatioResult }) {
  return <details className="comparison-evidence">
    <summary>Evidence &amp; formula <ChevronDown size={13} /></summary>
    <div className="comparison-evidence-body">
      <p><strong>Formula</strong> {ratio.formula}</p>
      {ratio.note && <p>{ratio.note}</p>}
      {ratio.inputs.length > 0 ? ratio.inputs.map((input, i) => <div className="comparison-source-line" key={`${input.metric}-${i}`}>
        <span><b>{input.metric}</b> · {input.amount === null ? 'Unavailable' : `${input.amount.toLocaleString()} ${input.currency || ''} ${input.unit || ''}`} · {input.date || `FY ${input.financialYear}`}</span>
        {input.sourceUrl && <a href={input.sourceUrl} target="_blank" rel="noreferrer" data-testid={`link-comparison-source-${ratio.id}-${i}`}>Source <ExternalLink size={11} /></a>}
      </div>) : <p>No matching source rows.</p>}
    </div>
  </details>;
}

export default function AirlineComparisonPage() {
  const [records, setRecords] = useState<ComparisonRecord[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [classificationError, setClassificationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [airlineSearch, setAirlineSearch] = useState('');
  const [year, setYear] = useState('');
  const [period, setPeriod] = useState('');
  const [scope, setScope] = useState('');
  const [basisByAirline, setBasisByAirline] = useState<Record<string, string>>({});
  const [classificationFilters, setClassificationFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/airline-financials.json`).then((response) => {
        if (!response.ok) throw new Error(`Workbook data could not be loaded (${response.status}).`);
        return response.json() as Promise<ComparisonRecord[]>;
      }),
      fetch(`${import.meta.env.BASE_URL}data/airline-classifications.json`).then((response) => {
        if (!response.ok) return { records: [] as Classification[], error: `Classification metadata could not be loaded (${response.status}).` };
        return response.json() as Promise<{ records?: Classification[] }>;
      }).catch((loadError: unknown) => ({
        records: [] as Classification[],
        error: loadError instanceof Error ? loadError.message : 'Classification metadata could not be loaded.',
      })),
    ]).then(([data, classificationData]) => {
      if (!active) return;
      if (!Array.isArray(data) || data.length !== EXPECTED_ROWS) throw new Error('Workbook data failed its row-count check.');
      setRecords(data);
      setClassifications(Array.isArray(classificationData.records) ? classificationData.records : []);
      const names = [...new Set(data.map((record) => record.airline))].sort((a, b) => a.localeCompare(b));
      const years = [...new Set(data.map((record) => record.financialYear))].sort((a, b) => Number(b) - Number(a));
      const initialYear = years[0] ?? '';
      const initialPeriods = getAvailableComparisonPeriods(data, initialYear);
      const initialPeriod = initialPeriods.includes('YR') ? 'YR' : initialPeriods[0] ?? '';
      const initialScope = getComparisonScopes(data, names, initialYear, initialPeriod)[0]?.scope ?? '';
      const comparableAirlines = names.filter((name) => getBasisOptions(data, name, initialYear, initialPeriod, initialScope).length > 0);
      setSelectedAirlines(comparableAirlines.slice(0, Math.min(4, comparableAirlines.length)));
      setYear(initialYear);
      setClassificationError(classificationData.error ?? '');
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : 'Workbook data could not be loaded.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [retryKey]);

  const airlines = useMemo(() => [...new Set(records.map((record) => record.airline))].sort((a, b) => a.localeCompare(b)), [records]);
  const years = useMemo(() => [...new Set(records.map((record) => record.financialYear))].sort((a, b) => Number(b) - Number(a)), [records]);
  const periods = useMemo(() => year ? getAvailableComparisonPeriods(records, year) : [], [records, year]);
  useEffect(() => { if (!periods.includes(period)) setPeriod(periods.includes('YR') ? 'YR' : periods[0] ?? ''); }, [periods, period]);
  const verifiedClassifications = useMemo(() => classifications.filter((entry) => entry.verificationStatus?.toLowerCase() === 'verified' && entry.sourceUrl), [classifications]);
  const classificationFacets = useMemo(() => CLASSIFICATION_FACETS.map(({ field, label }) => ({
    field,
    label,
    values: [...new Set(verifiedClassifications.map((entry) => entry[field]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0))].sort((a, b) => a.localeCompare(b)),
  })).filter((facet) => facet.values.length > 0), [verifiedClassifications]);
  const classByAirline = useMemo(() => new Map(verifiedClassifications.map((entry) => [entry.airline, entry])), [verifiedClassifications]);
  const classificationMatchedAirlines = useMemo(() => airlines.filter((name) => {
    const metadata = classByAirline.get(name);
    return Object.entries(classificationFilters).every(([field, value]) =>
      !value || metadata?.[field as keyof Classification] === value,
    );
  }), [airlines, classByAirline, classificationFilters]);
  const filteredAirlines = useMemo(() => classificationMatchedAirlines
    .filter((name) => name.toLowerCase().includes(airlineSearch.trim().toLowerCase())),
  [classificationMatchedAirlines, airlineSearch]);
  const activeSelectedAirlines = useMemo(
    () => selectedAirlines.filter((name) => classificationMatchedAirlines.includes(name)),
    [selectedAirlines, classificationMatchedAirlines],
  );
  const selectedClassificationCount = activeSelectedAirlines.filter((name) => classByAirline.has(name)).length;
  const selectedVerifiedClassifications = activeSelectedAirlines
    .map((name) => classByAirline.get(name))
    .filter((entry): entry is Classification => Boolean(entry));
  const scopes = useMemo(() => year && period ? getComparisonScopes(records, activeSelectedAirlines, year, period) : [], [records, activeSelectedAirlines, year, period]);
  useEffect(() => { if (!scopes.some((entry) => entry.scope === scope)) setScope(scopes[0]?.scope ?? ''); }, [scopes, scope]);
  useEffect(() => {
    if (!year || !period || !scope) return;
    setBasisByAirline((current) => {
      const next = { ...current };
      let changed = false;
      for (const [airline, key] of Object.entries(current)) {
        const stillAvailable = activeSelectedAirlines.includes(airline) &&
          getBasisOptions(records, airline, year, period, scope).some((basis) => basis.key === key);
        if (!stillAvailable) {
          delete next[airline];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [records, activeSelectedAirlines, year, period, scope]);
  const rows = useMemo(
    () => year && period && scope ? buildAirlineComparison(records, activeSelectedAirlines, year, period, scope, basisByAirline) : [],
    [records, activeSelectedAirlines, year, period, scope, basisByAirline],
  );

  const toggleAirline = (name: string) => setSelectedAirlines((current) => current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]);
  const selectAll = () => setSelectedAirlines((current) => [...new Set([...current, ...filteredAirlines])]);
  const clearAll = () => setSelectedAirlines([]);
  const getBasis = (airline: string) => getBasisOptions(records, airline, year, period, scope);

  return <div className="app-shell">
    <SiteHeader activePage="comparison" status="Workbook · source-linked" />
    <main className="page comparison-page">
      <header className="comparison-heading">
        <div>
          <div className="eyebrow">Airline Economics · comparative research</div>
          <h1>Airline Comparison &amp; Benchmarking</h1>
          <p>Compare financial health on explicit reporting bases. Every unavailable value stays unavailable; no currency conversion is applied.</p>
        </div>
        <div className="comparison-count"><span>WORKBOOK COVERAGE</span><strong>{records.length.toLocaleString()} rows</strong><small>{airlines.length || 142} airline names</small></div>
      </header>

      <section className="comparison-controls panel" aria-label="Comparison controls">
        <div className="comparison-controls-top"><div className="comparison-control-title"><SlidersHorizontal size={16} /><div><strong>Build a peer set</strong><span>Choose airlines, then align period and reporting scope.</span></div></div>
          <span className="comparison-step">01 / SELECT</span></div>
        <div className="comparison-control-grid">
          <div className="comparison-airline-picker">
            <div className="comparison-label-row"><label htmlFor="comparison-search">Airlines</label><span>{activeSelectedAirlines.length} selected for comparison</span></div>
            <div className="comparison-search"><Search size={15} /><input id="comparison-search" value={airlineSearch} onChange={(event) => setAirlineSearch(event.target.value)} placeholder="Search all airline names" data-testid="input-comparison-airline-search" disabled={loading || !!error} /></div>
            <div className="comparison-picker-actions"><button type="button" onClick={selectAll} data-testid="button-select-visible-airlines">Select visible</button><button type="button" onClick={clearAll} data-testid="button-clear-airlines">Clear</button></div>
            <div className="comparison-airline-list" role="group" aria-label="Select airlines">
              {filteredAirlines.map((name) => <label className="comparison-airline-option" key={name}>
                <input type="checkbox" checked={selectedAirlines.includes(name)} onChange={() => toggleAirline(name)} data-testid={`checkbox-airline-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />
                <span>{name}</span>{classByAirline.has(name) ? <small className="class-verified">Verified</small> : <small>Unclassified / Needs Review</small>}
              </label>)}
              {!filteredAirlines.length && <div className="comparison-no-match">No airline names match this search.</div>}
            </div>
          </div>
          <div className="comparison-period-controls">
            <div className="comparison-filter-grid">
              <label className="statement-field"><span>Financial year</span><select value={year} onChange={(event) => { setYear(event.target.value); setPeriod(''); }} disabled={loading || !!error || !years.length} data-testid="select-comparison-year">{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="statement-field"><span>Reporting period</span><select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={loading || !!error || !periods.length} data-testid="select-comparison-period">{periods.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="statement-field"><span>Reporting scope</span><select value={scope} onChange={(event) => setScope(event.target.value)} disabled={loading || !!error || !scopes.length} data-testid="select-comparison-scope">{scopes.map((value) => <option key={value.scope} value={value.scope}>{value.scope} · {value.airlineCount} airlines</option>)}</select></label>
            </div>
            <div className="comparison-scope-note"><Info size={14} /><span>Scope coverage is calculated across this peer set. Basis choices remain specific to each airline; unlike currencies are not converted.</span></div>
          </div>
        </div>
        {classificationFacets.length > 0 && <div className="comparison-classification-filters">
          <div className="comparison-classification-heading"><strong>Classification filters</strong><span>Verified records only · {verifiedClassifications.length} / {airlines.length} airlines sourced</span></div>
          <div className="comparison-filter-grid">
            {classificationFacets.map((facet) => <label className="statement-field" key={facet.field}>
              <span>{facet.label}</span>
              <select value={classificationFilters[String(facet.field)] ?? ''} onChange={(event) => setClassificationFilters((current) => ({ ...current, [String(facet.field)]: event.target.value }))} data-testid={`select-classification-${String(facet.field)}`}>
                <option value="">All classifications</option>
                {facet.values.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>)}
          </div>
          <p>Unclassified and Needs Review airlines remain available when no classification filter is applied; filtered classification benchmarks use verified records only.</p>
        </div>}
        {classificationFacets.length === 0 && <div className="comparison-classification-unavailable" role="status">
          {classificationError || `Verified region, business model, airline type, size, ownership, or group metadata is not available. Classification filters are hidden; all ${airlines.length} airlines remain available for manual comparison.`}
        </div>}
        {selectedVerifiedClassifications.length > 0 && <div className="comparison-classification-register">
          <div className="comparison-classification-heading"><strong>Verified airline classifications</strong><span>{selectedVerifiedClassifications.length} selected · sources included</span></div>
          <div className="comparison-classification-table-wrap">
            <table>
              <thead><tr><th>Airline</th><th>Region</th><th>Business model</th><th>Airline type</th><th>Airline size</th><th>Ownership</th><th>Airline group</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>{selectedVerifiedClassifications.map((entry) => <tr key={entry.airline}>
                <th scope="row">{entry.airline}</th><td>{entry.region || 'Unclassified'}</td><td>{entry.businessModel || 'Unclassified'}</td><td>{entry.airlineType || 'Unclassified'}</td><td>{entry.airlineSize || 'Unclassified'}</td><td>{entry.ownership || 'Unclassified'}</td><td>{entry.airlineGroup || 'Unclassified'}</td><td>{entry.verificationStatus}</td>
                <td>{entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noreferrer" data-testid={`link-classification-source-${entry.airline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>Source <ExternalLink size={11} /></a>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
        <div className="comparison-selection-foot"><span><Check size={14} /> {activeSelectedAirlines.length} airlines in peer set</span><span>{selectedClassificationCount} / {activeSelectedAirlines.length} with verified classification evidence</span></div>
      </section>

      {error && <div className="comparison-error" role="alert"><AlertCircle size={18} /><div><strong>Comparison data could not be loaded</strong><p>{error}</p></div><button type="button" onClick={() => setRetryKey((key) => key + 1)} data-testid="button-retry-comparison">Retry</button></div>}
      {loading ? <section className="panel comparison-loading"><Skeleton /><p>Checking workbook rows and reporting bases…</p></section> : !error && <>
        <section className="comparison-basis-section">
          <div className="comparison-section-heading"><div><div className="eyebrow">02 / REPORTING BASIS</div><h2>Basis selection</h2></div><span>{activeSelectedAirlines.length} airlines · {year} {period} · {scope || 'No shared scope'}</span></div>
          {activeSelectedAirlines.length === 0 ? <div className="comparison-empty panel"><strong>Start with an airline</strong><p>Search the full workbook airline list and select one or more peers.</p></div> :
            <div className="basis-grid">{activeSelectedAirlines.map((airline) => {
              const options = getBasis(airline);
              const row = rows.find((candidate) => candidate.airline === airline);
              const value = basisByAirline[airline] ?? '';
              return <div className="basis-card panel" key={airline} data-testid={`basis-card-${airline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                <div className="basis-card-head"><span className="basis-mark">{airline.slice(0, 1)}</span><div><strong>{airline}</strong><small>{classByAirline.has(airline) ? 'Verified classification available' : 'Unclassified / Needs Review'}</small></div></div>
                {options.length > 1 ? <label className="statement-field"><span>Choose reporting basis · required</span><select value={value} onChange={(event) => setBasisByAirline((current) => ({ ...current, [airline]: event.target.value }))} data-testid={`select-basis-${airline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}><option value="">Select a basis</option>{options.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label> :
                  <div className="basis-single">{options[0]?.label || 'No basis available for selected period and scope'}</div>}
                {row?.excludedReason && <div className="basis-warning">{row.excludedReason}</div>}
              </div>;
            })}</div>}
        </section>

        <section className="comparison-results" aria-live="polite">
          <div className="comparison-section-heading"><div><div className="eyebrow">03 / BENCHMARKS</div><h2>Peer-set rankings</h2></div><div className="comparison-rank-caption"><ArrowDownWideNarrow size={14} />Ranks are metric-specific; ties share rank</div></div>
          <div className="comparison-rank-grid">{METRICS.map((metric) => {
            const ranked = [...rows].filter((row) => row.rankings[metric.id].value !== null).sort((a, b) => (a.rankings[metric.id].rank ?? Infinity) - (b.rankings[metric.id].rank ?? Infinity));
            const unavailable = rows.filter((row) => row.rankings[metric.id].value === null);
            return <article className="comparison-rank-card panel" key={metric.id} data-testid={`ranking-${metric.id}`}>
              <header><div><span>{metric.title}</span><h3>{metric.measure}</h3></div><small>{metric.direction}</small></header>
              <div className="comparison-rank-meta"><span>Observed</span><strong>{ranked.length} / {rows.length}</strong><span>available</span></div>
              {ranked.length ? <ol>{ranked.map((row) => <li key={row.airline} data-testid={`rank-${metric.id}-${row.airline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                <span className="rank-number">{row.rankings[metric.id].rank}</span><div className="rank-airline"><strong>{row.airline}</strong><small>{row.basisLabel || 'Basis not selected'}</small></div><div className="rank-value"><strong>{formatMetricValue(row, metric.id)}</strong><small>{metricCoverage(row, metric.id)}</small></div>
              </li>)}</ol> : <div className="comparison-rank-empty">No comparable values on this basis.</div>}
              {unavailable.length > 0 && <details className="comparison-unavailable"><summary>{unavailable.length} unavailable or excluded <ChevronDown size={12} /></summary><div>{unavailable.map((row) => <p key={row.airline}><strong>{row.airline}</strong> — {row.excludedReason || row.revenueGrowthNote || 'Required source values are unavailable.'}</p>)}</div></details>}
            </article>;
          })}</div>
        </section>

        <section className="comparison-observations panel">
          <div className="comparison-observation-head"><div><div className="eyebrow">TRANSPARENCY &amp; EVIDENCE</div><h2>Read the basis before the ranking</h2></div><ShieldCheck size={19} /></div>
          <div className="comparison-notes-grid">
            <div><strong>Classification coverage</strong><p>{verifiedClassifications.length} of {airlines.length} workbook airlines have verified classification records with a source. Region, business model, airline type, size, ownership, and group are never inferred. Filters appear only for verified metadata values.</p></div>
            <div><strong>Stability score is a heuristic</strong><p>Only a fully observed 0–4 count is ranked: positive EBITDA margin; debt/equity ≤ 1; current ratio ≥ 1; net-interest coverage ≥ 1. It is not a credit rating. Partial signal sets are shown as coverage, not scored.</p></div>
            <div><strong>Currency &amp; reporting basis</strong><p>Ratios are dimensionless. Revenue growth compares same-basis Total Revenue year over year; raw revenue amounts are never ranked across currencies. Currency, unit, entity, scope, and period remain visible in basis labels.</p></div>
            <div><strong>Missing is not zero</strong><p>Missing or ambiguous source rows remain unavailable. Revenue growth needs a unique prior-year Total Revenue record on the selected currency, unit, scope, entity, and fiscal-year basis.</p></div>
          </div>
        </section>
        <section className="comparison-source-evidence">
          <div className="comparison-section-heading"><div><div className="eyebrow">SOURCE TRACE</div><h2>Calculation evidence</h2></div><span>Source records retained from the supplied workbook</span></div>
          {rows.filter((row) => row.snapshot).map((row) => <div className="comparison-evidence-card panel" key={row.airline}>
            <strong>{row.airline}</strong><span>{row.snapshot?.reportingScope || 'Scope not stated'} · {row.snapshot?.currency || 'Currency not stated'} · {row.snapshot?.unit || 'Unit not stated'} · {row.snapshot?.date || `FY ${year} ${period}`}</span>
            <div className="comparison-evidence-ratios">{row.snapshot?.ratios.filter((ratio) => ['ebitda-margin', 'debt-to-equity', 'current-ratio', 'interest-coverage'].includes(ratio.id)).map((ratio) => <BasisSource ratio={ratio} key={ratio.id} />)}
              {row.revenueGrowthInputs.map((input) => <div className="comparison-source-line" key={`revenue-${input.financialYear}-${input.date}`}>
                <span><b>Total Revenue · FY {input.financialYear} {input.reportingPeriod}</b> · {input.amount?.toLocaleString()} {input.currency || ''} {input.unit || ''} · {input.date || 'Date not stated'}</span>
                {input.sourceUrl && <a href={input.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={11} /></a>}
              </div>)}
            </div>
          </div>)}
          {!rows.some((row) => row.snapshot) && <div className="comparison-empty panel"><strong>No selected reporting snapshots</strong><p>Choose a shared scope and resolve any multiple reporting-basis selections above.</p></div>}
        </section>
      </>}
    </main>
  </div>;
}
