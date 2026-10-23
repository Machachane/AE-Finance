import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Landmark, ShieldCheck } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';

type Mla = {
  name: string;
  totalUsdM: number;
  numberOfDeals: number;
  capitalMarketsUsdM: number;
  commercialUsdM: number;
  reportingPeriod: string;
  year: number;
};
type Borrower = { name: string; totalUsdM: number; numberOfDeals: number; reportingPeriod: string; year: number };
type FinanceData = {
  metadata: { mlaSourceFile: string; borrowerSourceFile: string; amountUnit: string; rankedDataNote: string };
  mlas: Mla[];
  borrowers: Borrower[];
};

const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'YR'];
const isNamedEntity = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return !!normalized && !/(undisclosed|non[-\s]?disclosed|unnamed|no mla|not disclosed|n\/a|unknown)/i.test(normalized);
};
const formatAmount = (value: number) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
}).format(value);

type RankedRow = { name: string; year: number; reportingPeriod: string; numberOfDeals?: number };
type BarTone = 'mlas' | 'borrowers' | 'capital' | 'commercial';

function Leaderboard<T extends RankedRow>({
  title, subtitle, rows, valueKey, limit, testId, entityLabel, valueLabel, barTone, withDeals = false, withPeriod = false,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  valueKey: keyof T;
  limit: number;
  testId: string;
  entityLabel: string;
  valueLabel: string;
  barTone: BarTone;
  withDeals?: boolean;
  withPeriod?: boolean;
}) {
  const entries = rows.slice(0, limit);
  const maxValue = Math.max(1, ...entries.map((row) => Number(row[valueKey])));
  return (
    <section className="panel af-board" aria-label={title} data-testid={`board-${testId}`}>
      <header className="af-board-head">
        <div>
          <span className="af-kicker">{subtitle}</span>
          <h2>{title}</h2>
        </div>
        <span className="af-limit">TOP {limit}</span>
      </header>
      {entries.length ? (
        <div className="af-table-wrap">
          <table className={`af-table ${withPeriod ? 'af-table-detailed' : ''}`}>
            <thead><tr>
              <th scope="col">{entityLabel}</th>
              <th scope="col" className="af-bar-heading">{valueLabel}</th>
              {withDeals && <th scope="col" className="af-deals-heading"><span className="af-deals-full">Number of Deals</span><span className="af-deals-short">Deals</span></th>}
              {withPeriod && <th scope="col" className="af-period-heading">Year</th>}
              {withPeriod && <th scope="col" className="af-period-heading">Reporting Period</th>}
            </tr></thead>
            <tbody>
              {entries.map((row, index) => (
                <tr key={`${row.name}-${index}`} data-testid={`row-${testId}-${index + 1}`}>
                  <th scope="row">{row.name}</th>
                  <td className="af-bar-cell">
                    <div className="af-bar-row">
                      <div className="af-bar-track" aria-hidden="true">
                        <span className={`af-bar-fill af-bar-fill-${barTone}`} style={{ width: `${Math.max(0, Math.min(100, (Number(row[valueKey]) / maxValue) * 100))}%` }} />
                      </div>
                      <span className="af-amount" title={`${Number(row[valueKey]).toLocaleString('en-US', { maximumFractionDigits: 4 })} USD millions`}>
                        {formatAmount(Number(row[valueKey]))}
                      </span>
                    </div>
                  </td>
                  {withDeals && <td className="af-deals">{row.numberOfDeals ?? '—'}</td>}
                  {withPeriod && <td className="af-period-value">{row.year}</td>}
                  {withPeriod && <td className="af-period-value">{row.reportingPeriod}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="af-empty" data-testid={`empty-${testId}`}>
          <Landmark size={19} aria-hidden="true" />
          <strong>No named entities for this selection</strong>
          <span>Try another year or reporting period.</span>
        </div>
      )}
    </section>
  );
}

function LoadingBoards() {
  return <div className="af-loading" aria-label="Loading aviation finance workbook" data-testid="status-aviation-finance-loading">
    {[0, 1, 2, 3].map((item) => <div className="panel af-skeleton" key={item}><i /><i /><i /><i /></div>)}
  </div>;
}

export default function AviationFinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [year, setYear] = useState(2026);
  const [period, setPeriod] = useState('H1');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch(`${import.meta.env.BASE_URL}data/aviation-finance-rankings.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Supplied workbook data could not be loaded (${response.status}).`);
        return response.json() as Promise<FinanceData>;
      })
      .then((payload) => {
        if (!payload || !Array.isArray(payload.mlas) || !Array.isArray(payload.borrowers) || !payload.metadata) {
          throw new Error('The supplied workbook data has an unexpected structure.');
        }
        if (active) { setData(payload); setLoading(false); }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Supplied workbook data could not be loaded.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [attempt]);

  const years = useMemo(() => data
    ? [...new Set([...data.mlas.map((row) => row.year), ...data.borrowers.map((row) => row.year)])].sort((a, b) => b - a)
    : [2026, 2025], [data]);
  const periods = useMemo(() => {
    if (!data) return year === 2026 ? ['Q1', 'Q2', 'H1'] : ['Q1', 'Q2', 'Q3', 'Q4', 'YR'];
    const available = new Set([
      ...data.mlas.filter((row) => row.year === year).map((row) => row.reportingPeriod),
      ...data.borrowers.filter((row) => row.year === year).map((row) => row.reportingPeriod),
    ]);
    return PERIOD_ORDER.filter((item) => available.has(item));
  }, [data, year]);

  const changeYear = (nextYear: number) => {
    setYear(nextYear);
    const available = data ? new Set([
      ...data.mlas.filter((row) => row.year === nextYear).map((row) => row.reportingPeriod),
      ...data.borrowers.filter((row) => row.year === nextYear).map((row) => row.reportingPeriod),
    ]) : new Set(nextYear === 2026 ? ['Q1', 'Q2', 'H1'] : ['Q1', 'Q2', 'Q3', 'Q4', 'YR']);
    const preferred = nextYear === 2026 ? 'H1' : 'YR';
    setPeriod(available.has(preferred) ? preferred : PERIOD_ORDER.find((item) => available.has(item)) ?? '');
  };

  const filtered = useMemo(() => {
    if (!data) return null;
    const mlas = data.mlas.filter((row) => row.year === year && row.reportingPeriod === period && isNamedEntity(row.name));
    const borrowers = data.borrowers.filter((row) => row.year === year && row.reportingPeriod === period && isNamedEntity(row.name));
    const eligible = <T extends { name: string }>(rows: T[], value: (row: T) => number) =>
      rows.filter((row) => Number.isFinite(value(row)) && value(row) > 0);
    return {
      mlas: eligible(mlas, (row) => row.totalUsdM).sort((a, b) => b.totalUsdM - a.totalUsdM),
      borrowers: eligible(borrowers, (row) => row.totalUsdM).sort((a, b) => b.totalUsdM - a.totalUsdM),
      capital: eligible(mlas, (row) => row.capitalMarketsUsdM).sort((a, b) => b.capitalMarketsUsdM - a.capitalMarketsUsdM),
      commercial: eligible(mlas, (row) => row.commercialUsdM).sort((a, b) => b.commercialUsdM - a.commercialUsdM),
    };
  }, [data, year, period]);

  const visibleCount = filtered ? filtered.mlas.length + filtered.borrowers.length : 0;
  return (
    <div className="app-shell">
      <SiteHeader activePage="aviation-finance" status="Supplied workbook · source-transparent" />
      <main className="page aviation-finance-page">
        <section className="af-heading">
          <div className="af-heading-copy">
            <div className="eyebrow">AIRLINE ECONOMICS · AVIATION FINANCE</div>
            <h1>Aviation <span>Finance</span></h1>
            <p>Compare lender, borrower and financing activity across supplied reporting periods.</p>
          </div>
          <div className="af-heading-stamp">
            <span>SELECTED PERIOD</span>
            <strong data-testid="text-selected-period">{year} · {period || '—'}</strong>
            <i>Workbook period aggregates</i>
          </div>
        </section>

        <div className="af-disclosure" role="note" data-testid="text-aviation-finance-disclosure">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>Values are shown as <strong>USD millions</strong> from the supplied workbooks. Undisclosed names are excluded from named rankings. Source workbook totals are displayed as supplied and have not been independently verified.</p>
        </div>

        <div className="af-finance-layout">
          <aside className="panel af-controls" aria-label="Leaderboard filters">
            <div className="af-filter-intro">
              <div className="af-filter-icon"><Landmark size={17} aria-hidden="true" /></div>
              <div><strong>Rankings period</strong><span>All boards use the same selected period.</span></div>
            </div>
            <div className="af-filter-fields">
              <label className="statement-field">
                <span>Year</span>
                <select data-testid="select-aviation-finance-year" aria-label="Reporting year" value={year} onChange={(event) => changeYear(Number(event.target.value))} disabled={loading || !years.length}>
                  {years.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="statement-field">
                <span>Reporting period</span>
                <select data-testid="select-aviation-finance-period" aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value)} disabled={loading || !periods.length}>
                  {periods.map((item) => <option key={item} value={item}>{item === 'YR' ? 'Full year · YR' : item === 'H1' ? 'Half year · H1' : `Quarter ${item.slice(1)} · ${item}`}</option>)}
                </select>
              </label>
            </div>
            <div className="af-period-meta" data-testid="text-aviation-finance-row-count">
              <span className="af-live-dot" />{loading ? 'Loading workbook' : `${visibleCount} named ranking rows`}
            </div>
          </aside>

          <div className="af-rankings-column">
            {loading && <LoadingBoards />}
            {error && <div className="error-box af-error" role="alert" data-testid="status-aviation-finance-error">
              <AlertCircle size={18} aria-hidden="true" />
              <div><strong>Workbook data could not be loaded</strong><p>{error}</p></div>
              <button type="button" className="retry-button" data-testid="button-retry-aviation-finance" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
            </div>}

            {!loading && !error && filtered && (
              <div className="af-board-stack" aria-live="polite" data-testid="content-aviation-finance-rankings">
                <Leaderboard title="Top 10 MLAs" subtitle="LENDER ACTIVITY" rows={filtered.mlas} valueKey="totalUsdM" limit={10} testId="mlas" entityLabel="MLA" valueLabel="Total (USD M)" barTone="mlas" withDeals withPeriod />
                <Leaderboard title="Top 10 Borrowers" subtitle="BORROWER ACTIVITY" rows={filtered.borrowers} valueKey="totalUsdM" limit={10} testId="borrowers" entityLabel="Borrower" valueLabel="Total (USD M)" barTone="borrowers" withDeals withPeriod />
                <Leaderboard title="Top 5 Capital Markets" subtitle="FINANCING MIX" rows={filtered.capital} valueKey="capitalMarketsUsdM" limit={5} testId="capital-markets" entityLabel="MLA" valueLabel="Cap Mkts Total (USD M)" barTone="capital" />
                <Leaderboard title="Top 5 Commercial" subtitle="FINANCING MIX" rows={filtered.commercial} valueKey="commercialUsdM" limit={5} testId="commercial" entityLabel="MLA" valueLabel="Commercial Total (USD M)" barTone="commercial" />
              </div>
            )}

            {data && !loading && !error && (
              <footer className="af-source-footer" data-testid="text-aviation-finance-sources">
                <span><i /> Source files supplied with this workspace</span>
                <span>{data.metadata.mlaSourceFile} <b>·</b> {data.metadata.borrowerSourceFile}</span>
              </footer>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
