export type FinancialRecord = {
  airline: string;
  metric: string;
  amount: number | null;
  currency?: string | null;
  unit?: string | null;
  financialYear: string;
  reportingPeriod: string;
  fiscalYearEnd?: string | null;
  date?: string | null;
  status?: string | null;
  reportingScope?: string | null;
  ifrs16Asc842Adoption?: string | null;
  inAdministration?: string | null;
  valueBasis?: string | null;
  reportingEntity?: string | null;
  sourceUrl?: string | null;
};

export type RankingRow = {
  name: string;
  totalUsdM: number;
  numberOfDeals: number;
  capitalMarketsUsdM?: number;
  commercialUsdM?: number;
  reportingPeriod: string;
  year: number;
};

export type RankingsData = {
  metadata: {
    mlaSourceFile: string;
    borrowerSourceFile: string;
    amountUnit: string;
    rankedDataNote: string;
  };
  mlas: RankingRow[];
  borrowers: RankingRow[];
};

export type AnalysisData = {
  sourceFile: string;
  year: number;
  periods: string[];
  tables: Array<{
    id: string;
    title: string;
    rows: Array<{
      label: string;
      valueKind: 'percentage' | 'usdBillions' | string;
      values: Record<string, number | null | undefined>;
    }>;
  }>;
};

export type AssistantDatasets = {
  financials: FinancialRecord[];
  rankings: RankingsData;
  analysis: AnalysisData;
};

export type AssistantPlan = {
  intent:
    | 'metric_lookup'
    | 'ratio_lookup'
    | 'aviation_ranking'
    | 'aviation_analysis'
    | 'navigation'
    | 'help'
    | 'unsupported';
  airlines: string[];
  metric: string | null;
  financialYear: string | null;
  reportingPeriod: string | null;
  ratioId: string | null;
  rankingType: 'mlas' | 'borrowers' | 'capitalMarkets' | 'commercial' | null;
  tableId: string | null;
  rankLimit: number | null;
  trend: boolean;
  navigateTo: 'financials' | 'statements' | 'ratios' | 'analytics' | 'aviationFinance' | null;
};

export type AssistantSource = {
  label: string;
  url?: string;
};

export type AssistantNavigation = {
  label: string;
  href: string;
};

export type AssistantAnswer = {
  answer: string;
  sources: AssistantSource[];
  navigation?: AssistantNavigation;
};

const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR'];
const RATIO_LABELS: Record<string, string> = {
  'ebitda-margin': 'EBITDA margin',
  'ebit-margin': 'EBIT margin',
  'operating-margin': 'Operating margin',
  'net-profit-margin': 'Net profit margin',
  roe: 'Return on equity (period)',
  roa: 'Return on assets (period)',
  'debt-to-equity': 'Reported debt / equity',
  'net-debt-ebitda': 'Net debt / reported-period EBITDA',
  'liabilities-to-assets': 'Total liabilities / assets',
  'current-ratio': 'Current ratio',
  'cash-ratio': 'Cash ratio',
  'quick-ratio': 'Quick ratio (cash + receivables)',
  'interest-coverage': 'Interest coverage (net interest)',
  'fuel-cost-share': 'Fuel cost / revenue',
  'staff-cost-share': 'Staff costs / revenue',
  'lease-rent-share': 'Lease rents / revenue',
  'other-operating-cost-share': 'Other operating costs / revenue',
  'passenger-revenue-share': 'Passenger revenue share',
  'cargo-revenue-share': 'Cargo revenue share',
  'other-revenue-share': 'Other revenue share',
};

const HEALTH_RATIOS = ['ebitda-margin', 'debt-to-equity', 'current-ratio', 'interest-coverage'];
const PROFITABILITY_RATIOS = ['ebitda-margin', 'ebit-margin', 'operating-margin', 'net-profit-margin'];
const LIQUIDITY_RATIOS = ['current-ratio', 'cash-ratio', 'quick-ratio'];

const PAGE_ROUTES: Record<NonNullable<AssistantPlan['navigateTo']>, { href: string; label: string }> = {
  financials: { href: '/', label: 'Airline Financials' },
  statements: { href: '/statements', label: 'Financial statements' },
  ratios: { href: '/ratios', label: 'Financial Ratios & KPIs' },
  analytics: { href: '/analytics', label: 'Airline Financial Analytics' },
  aviationFinance: { href: '/aviation-finance', label: 'Aviation Finance' },
};

export function getAssistantCatalog(datasets: AssistantDatasets) {
  return {
    airlines: unique(datasets.financials.map((row) => row.airline)).sort(),
    metrics: unique(datasets.financials.map((row) => row.metric)).sort(),
    financialYears: unique(datasets.financials.map((row) => row.financialYear)).sort(),
    reportingPeriods: unique(datasets.financials.map((row) => row.reportingPeriod)).sort(comparePeriods),
    ratios: [
      ...Object.entries(RATIO_LABELS).map(([id, label]) => ({ id, label })),
      { id: 'health_summary', label: 'Financial health summary' },
      { id: 'profitability_summary', label: 'Profitability ratios' },
      { id: 'liquidity_summary', label: 'Liquidity ratios' },
      { id: 'all', label: 'All available ratios' },
    ],
    rankingTypes: ['mlas', 'borrowers', 'capitalMarkets', 'commercial'],
    rankingYears: unique(datasets.rankings.mlas.concat(datasets.rankings.borrowers).map((row) => String(row.year))).sort(),
    rankingPeriods: unique(datasets.rankings.mlas.concat(datasets.rankings.borrowers).map((row) => row.reportingPeriod)).sort(comparePeriods),
    analysisTables: datasets.analysis.tables.map((table) => ({ id: table.id, title: table.title })),
    analysisYear: String(datasets.analysis.year),
    analysisPeriods: unique(datasets.analysis.tables.flatMap((table) => table.rows.flatMap((row) => Object.keys(row.values)))).sort(comparePeriods),
  };
}

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '');
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function comparePeriods(a: string, b: string) {
  const aIndex = PERIOD_ORDER.indexOf(a);
  const bIndex = PERIOD_ORDER.indexOf(b);
  return (aIndex < 0 ? PERIOD_ORDER.length : aIndex) - (bIndex < 0 ? PERIOD_ORDER.length : bIndex);
}

function basisKey(row: FinancialRecord) {
  return JSON.stringify([
    row.airline,
    row.reportingScope ?? '',
    row.reportingEntity ?? '',
    row.currency ?? '',
    row.unit ?? '',
    row.fiscalYearEnd ?? '',
  ]);
}

function periodKey(row: FinancialRecord) {
  return JSON.stringify([row.financialYear, row.reportingPeriod]);
}

function comparePeriodsByLatest(a: FinancialRecord, b: FinancialRecord) {
  return (b.date ?? '').localeCompare(a.date ?? '')
    || b.financialYear.localeCompare(a.financialYear, undefined, { numeric: true })
    || comparePeriods(b.reportingPeriod, a.reportingPeriod);
}

function isNamedEntity(name: string) {
  const normalized = name.trim().toLocaleLowerCase();
  return Boolean(normalized) && !/(undisclosed|non[-\s]?disclosed|unnamed|no mla|not disclosed|n\/a|unknown)/i.test(normalized);
}

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Official source';
  }
}

function createSourceRegistry() {
  const sources: AssistantSource[] = [];
  const indexes = new Map<string, number>();
  return {
    addUrl(url: string | null | undefined) {
      if (!url || !/^https:\/\//i.test(url)) return '';
      let index = indexes.get(url);
      if (index === undefined) {
        index = sources.length;
        indexes.set(url, index);
        sources.push({ label: sourceLabel(url), url });
      }
      return `[${index + 1}]`;
    },
    addFile(file: string) {
      const key = `file:${file}`;
      let index = indexes.get(key);
      if (index === undefined) {
        index = sources.length;
        indexes.set(key, index);
        sources.push({ label: file });
      }
      return `[${index + 1}]`;
    },
    get sources() {
      return sources;
    },
  };
}

function formatAmount(row: FinancialRecord) {
  if (typeof row.amount !== 'number' || !Number.isFinite(row.amount)) return 'not reported';
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(row.amount);
  return [amount, row.currency, row.unit].filter(Boolean).join(' ');
}

function metadataLabel(row: FinancialRecord) {
  return [
    row.reportingScope || 'scope not stated',
    row.reportingEntity,
    row.status,
  ].filter(Boolean).join(' · ');
}

function answerWithSources(answer: string, registry: ReturnType<typeof createSourceRegistry>, navigation?: AssistantNavigation): AssistantAnswer {
  return { answer, sources: registry.sources, ...(navigation ? { navigation } : {}) };
}

function clarification(answer: string, navigation?: AssistantNavigation): AssistantAnswer {
  return { answer, sources: [], ...(navigation ? { navigation } : {}) };
}

function resolveAirlines(
  requested: string[],
  records: FinancialRecord[],
) {
  const names = unique(records.map((row) => row.airline));
  return requested.map((candidate) => names.find((name) => normalize(name) === normalize(candidate)) ?? null);
}

function validYear(
  requested: string | null,
  records: FinancialRecord[],
) {
  if (!requested) return null;
  return unique(records.map((row) => row.financialYear)).find((year) => year === requested) ?? undefined;
}

function validPeriod(
  requested: string | null,
  records: FinancialRecord[],
) {
  if (!requested) return null;
  return unique(records.map((row) => row.reportingPeriod)).find((period) => normalize(period) === normalize(requested)) ?? undefined;
}

function findMetric(requested: string | null, records: FinancialRecord[]) {
  if (!requested) return null;
  return unique(records.map((row) => row.metric)).find((metric) => normalize(metric) === normalize(requested)) ?? null;
}

function defaultNavigationPage(plan: AssistantPlan): AssistantPlan['navigateTo'] {
  if (plan.navigateTo) return plan.navigateTo;
  if (plan.intent === 'ratio_lookup') return 'ratios';
  if (plan.intent === 'aviation_ranking' || plan.intent === 'aviation_analysis') return 'aviationFinance';
  if (plan.intent === 'metric_lookup') {
    if (plan.airlines.length > 1) return null;
    return plan.trend ? 'analytics' : (plan.reportingPeriod ? 'statements' : 'financials');
  }
  return null;
}

function buildNavigation(
  plan: AssistantPlan,
  datasets: AssistantDatasets,
  resolvedAirline?: string,
) {
  const page = defaultNavigationPage(plan);
  if (!page) return undefined;
  const route = PAGE_ROUTES[page];
  const params = new URLSearchParams();
  const resolvedNames = resolveAirlines(plan.airlines, datasets.financials).filter((name): name is string => Boolean(name));
  const airline = resolvedAirline
    ?? (page === 'ratios' && resolvedNames.length > 1 ? resolvedNames[0] : undefined)
    ?? (plan.airlines.length === 1 ? resolvedNames[0] : undefined);

  if (airline) params.set('airline', airline);
  if (page === 'ratios' && resolvedNames.length > 1) {
    resolvedNames.slice(1, 3).forEach((name) => params.append('compare', name));
  }
  if (plan.metric && findMetric(plan.metric, datasets.financials)) params.set('metric', findMetric(plan.metric, datasets.financials)!);
  if (plan.ratioId && (RATIO_LABELS[plan.ratioId] || ['health_summary', 'profitability_summary', 'liquidity_summary'].includes(plan.ratioId))) {
    params.set('ratio', plan.ratioId);
  }

  const year = validYear(plan.financialYear, datasets.financials);
  const period = validPeriod(plan.reportingPeriod, datasets.financials);
  if (year && year !== undefined && page !== 'ratios' && page !== 'analytics') params.set('year', year);
  if (period && period !== undefined) params.set('period', period);

  if (page === 'aviationFinance') {
    const availableRows = datasets.rankings.mlas.concat(datasets.rankings.borrowers);
    const rankingYear = plan.financialYear && availableRows.some((row) => String(row.year) === plan.financialYear)
      ? plan.financialYear
      : null;
    const rankingPeriod = plan.reportingPeriod && availableRows.some((row) => row.reportingPeriod === plan.reportingPeriod)
      ? plan.reportingPeriod
      : null;
    params.delete('year');
    params.delete('period');
    if (rankingYear) params.set('year', rankingYear);
    if (rankingPeriod) params.set('period', rankingPeriod);
  }

  const query = params.toString();
  return { label: route.label, href: query ? `${route.href}?${query}` : route.href };
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const values = groups.get(key) ?? [];
    values.push(item);
    groups.set(key, values);
  }
  return groups;
}

function chooseLatestRows(rows: FinancialRecord[], financialYear: string | null, reportingPeriod: string | null) {
  let matches = rows.filter((row) =>
    (!financialYear || row.financialYear === financialYear)
    && (!reportingPeriod || row.reportingPeriod === reportingPeriod),
  );
  if (!matches.length) return { rows: [], ambiguous: false };

  if (!financialYear || !reportingPeriod) {
    matches = matches.sort(comparePeriodsByLatest);
    const latestDate = matches[0]?.date ?? '';
    const latestRows = matches.filter((row) => (row.date ?? '') === latestDate);
    const latestPeriods = unique(latestRows.map(periodKey));
    if (latestPeriods.length > 1) return { rows: latestRows, ambiguous: true };
    matches = latestRows;
  }

  const bases = groupBy(matches, basisKey);
  if (bases.size > 1) return { rows: matches, ambiguous: true };
  if (matches.length > 1) {
    const metrics = groupBy(matches, (row) => row.metric);
    if ([...metrics.values()].some((metricRows) => metricRows.length > 1)) return { rows: matches, ambiguous: true };
  }
  return { rows: matches, ambiguous: false };
}

function formatAmbiguousRows(rows: FinancialRecord[]) {
  const basisGroups = groupBy(rows, basisKey);
  return [...basisGroups.values()].slice(0, 5).map((group) => {
    const row = group[0]!;
    return `• ${row.reportingScope || 'Scope not stated'} · ${row.reportingEntity || 'Entity not stated'} · ${row.currency || 'currency not stated'} ${row.unit || ''}`.trim();
  });
}

function answerMetricLookup(plan: AssistantPlan, datasets: AssistantDatasets, navigation?: AssistantNavigation) {
  const { financials } = datasets;
  const missingYears = plan.financialYear !== null && validYear(plan.financialYear, financials) === undefined;
  if (missingYears) {
    const years = unique(financials.map((row) => row.financialYear)).sort();
    return clarification(`I could not match that financial year to the loaded dataset. Available years: ${years.join(', ')}.`);
  }
  const missingPeriod = plan.reportingPeriod !== null && validPeriod(plan.reportingPeriod, financials) === undefined;
  if (missingPeriod) {
    const periods = unique(financials.map((row) => row.reportingPeriod)).sort(comparePeriods);
    return clarification(`I could not match that reporting period to the loaded dataset. Available periods include ${periods.join(', ')}.`);
  }

  const metric = findMetric(plan.metric, financials);
  if (!metric) {
    return clarification('Which financial metric should I look up? I can search the 38 metrics in the loaded airline dataset.');
  }
  if (!plan.airlines.length) {
    return clarification(`Which airline should I use for ${metric}?`);
  }
  if (plan.airlines.length > 3) {
    return clarification('I can compare up to three airlines in one answer. Please name three or fewer.');
  }

  const resolved = resolveAirlines(plan.airlines, financials);
  if (resolved.some((name) => !name)) {
    const unknown = plan.airlines.filter((_, index) => !resolved[index]);
    return clarification(`I could not match ${unknown.join(', ')} to an exact airline name in the loaded dataset. Please use the airline name as listed in the platform.`);
  }
  const airlines = resolved as string[];
  const registry = createSourceRegistry();
  const resultLines: string[] = [];

  for (const airline of airlines) {
    const candidates = financials.filter((row) => row.airline === airline && row.metric === metric);
    if (plan.trend) {
      const groupedPeriods = groupBy(candidates, periodKey);
      const allRows = [...groupedPeriods.values()].flat();
      const allBasisGroups = groupBy(allRows, basisKey);
      if (allBasisGroups.size > 1) {
        return clarification(`The historical records for ${airline} use more than one reporting basis. Choose a reporting scope and currency on the Airline Financials page before comparing the trend.`, navigation);
      }
      if ([...groupedPeriods.values()].some((group) => group.length > 1)) {
        return clarification(`The historical records for ${airline} contain duplicate ${metric} rows in a reporting period. Please review the source rows on the Airline Financials page.`, navigation);
      }
      const trendRows = [...groupedPeriods.values()]
        .map((group) => group[0]!)
        .filter((row) =>
          (!plan.financialYear || row.financialYear === plan.financialYear)
          && (!plan.reportingPeriod || row.reportingPeriod === plan.reportingPeriod),
        )
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.financialYear.localeCompare(b.financialYear, undefined, { numeric: true }) || comparePeriods(a.reportingPeriod, b.reportingPeriod))
        .slice(-12);
      if (!trendRows.length) {
        resultLines.push(`• ${airline}: no reported ${metric} values match the selected period.`);
        continue;
      }
      resultLines.push(`**${airline} — ${metric}**`);
      for (const row of trendRows) {
        const citation = registry.addUrl(row.sourceUrl);
        resultLines.push(`• FY${row.financialYear} ${row.reportingPeriod}: ${formatAmount(row)}${citation ? ` ${citation}` : ''}`);
      }
      continue;
    }

    const chosen = chooseLatestRows(candidates, plan.financialYear, plan.reportingPeriod);
    if (!chosen.rows.length) {
      resultLines.push(`• ${airline}: no reported ${metric} value was found for the requested year and period.`);
      continue;
    }
    if (chosen.ambiguous) {
      const bases = formatAmbiguousRows(chosen.rows);
      return clarification(`I found more than one matching reporting basis for ${airline} (${metric}). Please choose the correct scope and currency:\n${bases.join('\n')}`, navigation);
    }
    const row = chosen.rows.find((candidate) => candidate.metric === metric)!;
    const citation = registry.addUrl(row.sourceUrl);
    resultLines.push(`• **${airline} — FY${row.financialYear} ${row.reportingPeriod}: ${metric}**: ${formatAmount(row)}${citation ? ` ${citation}` : ''}`);
    const details = metadataLabel(row);
    if (details) resultLines.push(`  ${details}${row.date ? ` · dated ${row.date}` : ''}`);
  }

  let lead = plan.trend
    ? `Reported ${metric} history from the loaded dataset (amounts remain in each airline’s reported currency and unit):`
    : `Source-linked ${metric} values from the loaded dataset (amounts remain in each airline’s reported currency and unit):`;
  if (airlines.length > 1) {
    lead += '\nThese values are shown separately, not ranked or converted; currencies and reporting bases may differ.';
  }
  return answerWithSources([lead, ...resultLines].join('\n'), registry, navigation);
}

type RatioValue = { id: string; label: string; value: number | null; note: string | null; inputs: FinancialRecord[]; format: 'percent' | 'multiple' };

const RATIO_FORMATS: Record<string, 'percent' | 'multiple'> = {
  'ebitda-margin': 'percent',
  'ebit-margin': 'percent',
  'operating-margin': 'percent',
  'net-profit-margin': 'percent',
  roe: 'percent',
  roa: 'percent',
  'debt-to-equity': 'multiple',
  'net-debt-ebitda': 'multiple',
  'liabilities-to-assets': 'percent',
  'current-ratio': 'multiple',
  'cash-ratio': 'multiple',
  'quick-ratio': 'multiple',
  'interest-coverage': 'multiple',
  'fuel-cost-share': 'percent',
  'staff-cost-share': 'percent',
  'lease-rent-share': 'percent',
  'other-operating-cost-share': 'percent',
  'passenger-revenue-share': 'percent',
  'cargo-revenue-share': 'percent',
  'other-revenue-share': 'percent',
};

const REQUIRED_METRICS: Record<string, string[]> = {
  'ebitda-margin': ['EBIT', 'Depreciation & Amortisation', 'Total Revenue'],
  'ebit-margin': ['EBIT', 'Total Revenue'],
  'operating-margin': ['Operating Profit/(Loss)', 'Total Revenue'],
  'net-profit-margin': ['Profit / Loss After Tax', 'Total Revenue'],
  roe: ['Profit / Loss After Tax', 'Total Equity'],
  roa: ['Profit / Loss After Tax', 'Total Assets'],
  'debt-to-equity': ['Short Term Debt', 'Long Term Debt & Lease Liabilities', 'Total Equity'],
  'net-debt-ebitda': ['Short Term Debt', 'Long Term Debt & Lease Liabilities', 'Cash & Liquid Investments', 'EBIT', 'Depreciation & Amortisation'],
  'liabilities-to-assets': ['Total Liabilities', 'Total Assets'],
  'current-ratio': ['Total Current Assets', 'Total Current Liabilities'],
  'cash-ratio': ['Cash & Liquid Investments', 'Total Current Liabilities'],
  'quick-ratio': ['Cash & Liquid Investments', 'Trade Receivables', 'Total Current Liabilities'],
  'interest-coverage': ['EBIT', 'Net Interest'],
  'fuel-cost-share': ['Fuel Costs', 'Total Revenue'],
  'staff-cost-share': ['Staff Costs', 'Total Revenue'],
  'lease-rent-share': ['Lease Rents', 'Total Revenue'],
  'other-operating-cost-share': ['Other Operating Costs', 'Total Revenue'],
  'passenger-revenue-share': ['Passenger Revenue', 'Total Revenue'],
  'cargo-revenue-share': ['Cargo Revenue', 'Total Revenue'],
  'other-revenue-share': ['Other / Unclassified Revenue', 'Total Revenue'],
};

function missingRatio(id: string, metrics: Map<string, FinancialRecord[]>, allInputs: FinancialRecord[]): RatioValue {
  const missing = (REQUIRED_METRICS[id] ?? []).filter((metric) => {
    const rows = metrics.get(metric) ?? [];
    return rows.length !== 1 || typeof rows[0]?.amount !== 'number' || !Number.isFinite(rows[0].amount);
  });
  return {
    id,
    label: RATIO_LABELS[id]!,
    value: null,
    note: `Unavailable: missing or ambiguous reported AMOUNT values for ${missing.join(', ')} in this reporting basis.`,
    inputs: allInputs,
    format: RATIO_FORMATS[id]!,
  };
}

function calculateOneRatio(
  id: string,
  metrics: Map<string, FinancialRecord[]>,
  allRecords: FinancialRecord[],
  rows: FinancialRecord[],
  basis: string,
) : RatioValue {
  const inputRows = unique((REQUIRED_METRICS[id] ?? []).flatMap((metric) => metrics.get(metric) ?? []));
  if ((REQUIRED_METRICS[id] ?? []).some((metric) => (metrics.get(metric) ?? []).length !== 1)) {
    return missingRatio(id, metrics, inputRows);
  }
  const amount = (metric: string) => {
    const value = metrics.get(metric)?.[0]?.amount;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  if ((REQUIRED_METRICS[id] ?? []).some((metric) => amount(metric) === null)) {
    return missingRatio(id, metrics, inputRows);
  }
  const n = (metric: string) => amount(metric)!;
  const revenue = n('Total Revenue');
  let value: number | null = null;
  let note: string | null = null;

  switch (id) {
    case 'ebitda-margin':
      if (revenue > 0) value = ((n('EBIT') + n('Depreciation & Amortisation')) / revenue) * 100;
      note = 'EBIT is used as reported; Operating Profit/(Loss) is not substituted.';
      break;
    case 'ebit-margin':
      if (revenue > 0) value = (n('EBIT') / revenue) * 100;
      break;
    case 'operating-margin':
      if (revenue > 0) value = (n('Operating Profit/(Loss)') / revenue) * 100;
      break;
    case 'net-profit-margin':
      if (revenue > 0) value = (n('Profit / Loss After Tax') / revenue) * 100;
      break;
    case 'debt-to-equity':
      if (n('Total Equity') > 0) value = (n('Short Term Debt') + n('Long Term Debt & Lease Liabilities')) / n('Total Equity');
      else note = 'Unavailable: Total Equity must be positive.';
      break;
    case 'net-debt-ebitda': {
      const ebitda = n('EBIT') + n('Depreciation & Amortisation');
      if (ebitda > 0) value = (n('Short Term Debt') + n('Long Term Debt & Lease Liabilities') - n('Cash & Liquid Investments')) / ebitda;
      else note = 'Unavailable: reported-period EBITDA is zero or negative.';
      if (rows[0]?.reportingPeriod !== 'YR') note = 'Uses reported-period EBITDA without annualisation; compare like-for-like reporting periods.';
      break;
    }
    case 'liabilities-to-assets':
      if (n('Total Assets') > 0) value = (n('Total Liabilities') / n('Total Assets')) * 100;
      break;
    case 'current-ratio':
      if (n('Total Current Liabilities') > 0) value = n('Total Current Assets') / n('Total Current Liabilities');
      break;
    case 'cash-ratio':
      if (n('Total Current Liabilities') > 0) value = n('Cash & Liquid Investments') / n('Total Current Liabilities');
      break;
    case 'quick-ratio':
      if (n('Total Current Liabilities') > 0) value = (n('Cash & Liquid Investments') + n('Trade Receivables')) / n('Total Current Liabilities');
      note = 'Uses only disclosed cash and trade receivables; other quick assets may not be included.';
      break;
    case 'interest-coverage':
      if (n('Net Interest') < 0) value = n('EBIT') / Math.abs(n('Net Interest'));
      else note = 'Unavailable: Net Interest is not reported as an expense.';
      break;
    case 'fuel-cost-share':
      if (revenue > 0) value = (Math.abs(n('Fuel Costs')) / revenue) * 100;
      break;
    case 'staff-cost-share':
      if (revenue > 0) value = (Math.abs(n('Staff Costs')) / revenue) * 100;
      break;
    case 'lease-rent-share':
      if (revenue > 0) value = (Math.abs(n('Lease Rents')) / revenue) * 100;
      break;
    case 'other-operating-cost-share':
      if (revenue > 0) value = (Math.abs(n('Other Operating Costs')) / revenue) * 100;
      break;
    case 'passenger-revenue-share':
      if (revenue > 0) value = (n('Passenger Revenue') / revenue) * 100;
      break;
    case 'cargo-revenue-share':
      if (revenue > 0) value = (n('Cargo Revenue') / revenue) * 100;
      break;
    case 'other-revenue-share':
      if (revenue > 0) value = (n('Other / Unclassified Revenue') / revenue) * 100;
      break;
    case 'roe':
    case 'roa': {
      const balanceMetric = id === 'roe' ? 'Total Equity' : 'Total Assets';
      const periodRow = rows[0];
      const openingCandidates = allRecords.filter((record) =>
        basisKey(record) === basis
        && record.metric === balanceMetric
        && record.reportingPeriod === 'YR'
        && Boolean(record.date && periodRow?.date && record.date < periodRow.date),
      ).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      const opening = openingCandidates[0];
      const closing = metrics.get(balanceMetric)?.[0];
      const profit = metrics.get('Profit / Loss After Tax')?.[0];
      const sameLatestDate = opening && openingCandidates.filter((record) => record.date === opening.date).length === 1;
      const inputs = unique([...(profit ? [profit] : []), ...(opening ? [opening] : []), ...(closing ? [closing] : [])]);
      if (
        !sameLatestDate
        || typeof opening?.amount !== 'number'
        || typeof closing?.amount !== 'number'
        || typeof profit?.amount !== 'number'
      ) {
        return {
          id, label: RATIO_LABELS[id]!, value: null,
          note: `Unavailable: ${balanceMetric} at the prior fiscal year-end and current reporting date, plus Profit / Loss After Tax, are required.`,
          inputs,
          format: 'percent',
        };
      }
      const average = (opening.amount + closing.amount) / 2;
      if (average <= 0) note = `Unavailable: average ${balanceMetric.toLowerCase()} is not positive.`;
      else {
        value = (profit.amount / average) * 100;
        note = 'Period return; not annualised. Uses the prior fiscal year-end and current period-end balance.';
      }
      return { id, label: RATIO_LABELS[id]!, value, note, inputs, format: 'percent' };
    }
  }

  if (value !== null && !Number.isFinite(value)) value = null;
  if (value === null && !note) note = 'Unavailable: a required denominator is zero or the ratio is not meaningful for these reported values.';
  if (id === 'debt-to-equity' && value !== null) note = 'Long-term debt includes lease liabilities as reported.';
  return { id, label: RATIO_LABELS[id]!, value, note, inputs: inputRows, format: RATIO_FORMATS[id]! };
}

function snapshotGroups(rows: FinancialRecord[]) {
  return groupBy(rows, (row) => JSON.stringify([periodKey(row), basisKey(row)]));
}

function chooseRatioSnapshot(rows: FinancialRecord[], financialYear: string | null, reportingPeriod: string | null) {
  let candidates = rows.filter((row) =>
    (!financialYear || row.financialYear === financialYear)
    && (!reportingPeriod || row.reportingPeriod === reportingPeriod),
  );
  if (!candidates.length) return { rows: [], ambiguous: false };
  const groups = [...snapshotGroups(candidates).values()];
  if (!financialYear || !reportingPeriod) {
    groups.sort((a, b) => comparePeriodsByLatest(a[0]!, b[0]!));
    const latest = groups[0]!;
    const latestDate = latest.map((row) => row.date ?? '').sort().at(-1) ?? '';
    const latestGroups = groups.filter((group) => (group.map((row) => row.date ?? '').sort().at(-1) ?? '') === latestDate);
    const latestKeys = unique(latestGroups.map((group) => JSON.stringify([periodKey(group[0]!), basisKey(group[0]!)])));
    if (latestKeys.length > 1) return { rows: latestGroups.flat(), ambiguous: true };
    candidates = latest;
  } else {
    const bases = groupBy(candidates, basisKey);
    if (bases.size > 1) return { rows: candidates, ambiguous: true };
    candidates = groups[0]!;
  }
  const samePeriod = groupBy(candidates, periodKey);
  if (samePeriod.size > 1) return { rows: candidates, ambiguous: true };
  return { rows: candidates, ambiguous: false };
}

function ratioSummary(
  plan: AssistantPlan,
  records: FinancialRecord[],
  allRecords: FinancialRecord[],
  registry: ReturnType<typeof createSourceRegistry>,
) {
  const ratioId = plan.ratioId;
  if (!ratioId) return { text: 'Which ratio or KPI should I calculate? Examples include EBITDA margin, return on equity, current ratio, debt-to-equity, and interest coverage.', rows: [] as FinancialRecord[] };
  const ids = ratioId === 'health_summary' ? HEALTH_RATIOS
    : ratioId === 'profitability_summary' ? PROFITABILITY_RATIOS
      : ratioId === 'liquidity_summary' ? LIQUIDITY_RATIOS
        : ratioId === 'all' ? Object.keys(RATIO_LABELS)
          : [ratioId];
  const parts: string[] = [];
  const inputs: FinancialRecord[] = [];
  for (const id of ids) {
    const metrics = new Map(
      unique(records.map((row) => row.metric)).map((metric) => [metric, records.filter((row) => row.metric === metric)]),
    );
    const ratio = calculateOneRatio(id, metrics, allRecords, records, basisKey(records[0]!));
    inputs.push(...ratio.inputs);
    const citations = unique(ratio.inputs.map((row) => registry.addUrl(row.sourceUrl)).filter(Boolean)).join(' ');
    const rendered = ratio.value === null
      ? 'Unavailable'
      : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(ratio.value)}${ratio.format === 'percent' ? '%' : 'x'}`;
    parts.push(`• **${ratio.label}**: ${rendered}${citations ? ` ${citations}` : ''}${ratio.note ? ` — ${ratio.note}` : ''}`);
  }
  return { text: parts.join('\n'), rows: unique(inputs) };
}

function answerRatioLookup(plan: AssistantPlan, datasets: AssistantDatasets, navigation?: AssistantNavigation) {
  const { financials } = datasets;
  if (!plan.airlines.length) return clarification('Which airline should I use for this ratio or KPI?');
  if (plan.airlines.length > 3) return clarification('I can compare up to three airlines in one answer. Please name three or fewer.');
  if (plan.airlines.length > 1 && (!plan.financialYear || !plan.reportingPeriod)) {
    return clarification('To compare airlines fairly, specify both a financial year and reporting period (for example, FY2025 YR).');
  }
  if (plan.ratioId && !RATIO_LABELS[plan.ratioId] && !['health_summary', 'profitability_summary', 'liquidity_summary', 'all'].includes(plan.ratioId)) {
    return clarification('I could not match that ratio to the supported KPI definitions. Try EBITDA margin, ROE, ROA, debt-to-equity, net debt/EBITDA, a liquidity ratio, or interest coverage.');
  }

  const resolved = resolveAirlines(plan.airlines, financials);
  if (resolved.some((name) => !name)) {
    const unknown = plan.airlines.filter((_, index) => !resolved[index]);
    return clarification(`I could not match ${unknown.join(', ')} to an exact airline name in the loaded dataset.`);
  }
  const registry = createSourceRegistry();
  const lines: string[] = [];
  let allInputs: FinancialRecord[] = [];

  for (const airline of resolved as string[]) {
    const airlineRows = financials.filter((row) => row.airline === airline);
    const chosen = chooseRatioSnapshot(airlineRows, plan.financialYear, plan.reportingPeriod);
    if (!chosen.rows.length) {
      lines.push(`**${airline}**: no matching reported period was found.`);
      continue;
    }
    if (chosen.ambiguous) {
      const bases = formatAmbiguousRows(chosen.rows);
      return clarification(`I found more than one reporting basis or period for ${airline}. Please select the intended period and reporting scope:\n${bases.join('\n')}`);
    }
    const rows = chosen.rows;
    const first = rows[0]!;
    const snapshot = snapshotGroups(rows);
    if (snapshot.size !== 1) {
      return clarification(`I could not isolate one exact financial-year and reporting-period snapshot for ${airline}. Please specify both.`);
    }
    const basis = basisKey(first);
    const registryRows = rows;
    const ratioResult = ratioSummary(plan, registryRows, financials, registry);
    allInputs = [...allInputs, ...ratioResult.rows];
    const disclosure = [
      first.reportingScope || 'scope not stated',
      first.currency || 'currency not stated',
      first.unit || '',
    ].filter(Boolean).join(' · ');
    lines.push(`**${airline} — FY${first.financialYear} ${first.reportingPeriod}** (${disclosure})`);
    lines.push(ratioResult.text);
    if (first.inAdministration?.toLocaleLowerCase().startsWith('yes')) {
      const citation = registry.addUrl(first.sourceUrl);
      lines.push(`• In administration: ${first.inAdministration}${citation ? ` ${citation}` : ''}`);
    }
    if (plan.trend && plan.ratioId && RATIO_LABELS[plan.ratioId]) {
      const historyGroups = snapshotGroups(airlineRows.filter((row) => basisKey(row) === basis));
      const history = [...historyGroups.values()]
        .sort((a, b) => (a[0]?.date ?? '').localeCompare(b[0]?.date ?? '') || a[0]!.financialYear.localeCompare(b[0]!.financialYear, undefined, { numeric: true }) || comparePeriods(a[0]!.reportingPeriod, b[0]!.reportingPeriod))
        .slice(-12);
      const trendLines = history.map((group) => {
        const groupRows = group;
        const ratio = calculateOneRatio(plan.ratioId!, new Map(
          unique(groupRows.map((row) => row.metric)).map((metric) => [metric, groupRows.filter((row) => row.metric === metric)]),
        ), financials, groupRows, basis);
        for (const input of ratio.inputs) {
          registry.addUrl(input.sourceUrl);
          allInputs.push(input);
        }
        const citations = unique(ratio.inputs.map((input) => registry.addUrl(input.sourceUrl)).filter(Boolean)).join(' ');
        return `• FY${groupRows[0]!.financialYear} ${groupRows[0]!.reportingPeriod}: ${ratio.value === null ? 'Unavailable' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(ratio.value)}${ratio.format === 'percent' ? '%' : 'x'}`}${citations ? ` ${citations}` : ''}`;
      });
      lines.push('**Historical trend on the same reporting basis**');
      lines.push(...trendLines);
    }
  }

  const sources = registry.sources;
  const scopeNote = 'Ratios use exact reported inputs in each airline’s original currency and unit. Missing or ambiguous inputs are not estimated; interim results are not annualised.';
  const lead = plan.trend ? `Historical KPI results from the loaded workbook.\n${scopeNote}` : `Calculated from the loaded reported figures.\n${scopeNote}`;
  return answerWithSources([lead, ...lines].join('\n'), { ...registry, sources }, navigation);
}

function latestRankingPeriod(rows: Array<{ year: number; reportingPeriod: string }>) {
  return [...rows].sort((a, b) => b.year - a.year || comparePeriods(b.reportingPeriod, a.reportingPeriod))[0];
}

function answerRanking(plan: AssistantPlan, datasets: AssistantDatasets, navigation?: AssistantNavigation) {
  const rankingType = plan.rankingType;
  if (!rankingType) {
    return clarification('Which Aviation Finance list do you want: top MLAs, borrowers, Capital Markets, or Commercial?');
  }
  const allRows = rankingType === 'borrowers' ? datasets.rankings.borrowers : datasets.rankings.mlas;
  if (!allRows.length) return clarification('No aviation-finance ranking rows are available in the loaded data.');
  const availableYears = unique(allRows.map((row) => row.year)).sort((a, b) => a - b);
  if (plan.financialYear && !availableYears.includes(Number(plan.financialYear))) {
    return clarification(`The loaded ${rankingType} data is available for ${availableYears.join(', ')}.`);
  }
  const yearRows = plan.financialYear
    ? allRows.filter((row) => row.year === Number(plan.financialYear))
    : allRows;
  const availablePeriods = unique(yearRows.map((row) => row.reportingPeriod)).sort(comparePeriods);
  if (plan.reportingPeriod && !availablePeriods.includes(plan.reportingPeriod)) {
    return clarification(`For ${plan.financialYear ?? 'the available years'}, the loaded ${rankingType} data has these periods: ${availablePeriods.join(', ')}.`);
  }
  const latest = latestRankingPeriod(yearRows);
  if (!latest) return clarification('No aviation-finance ranking rows are available in the loaded data.');
  const year = plan.financialYear ? Number(plan.financialYear) : latest.year;
  const period = plan.reportingPeriod ?? latest.reportingPeriod;
  const selected = allRows.filter((row) => row.year === year && row.reportingPeriod === period && isNamedEntity(row.name));
  const valueFor = (row: RankingRow) => rankingType === 'capitalMarkets'
    ? row.capitalMarketsUsdM ?? 0
    : rankingType === 'commercial'
      ? row.commercialUsdM ?? 0
      : row.totalUsdM;
  const rows = selected
    .filter((row) => valueFor(row) > 0)
    .sort((a, b) => valueFor(b) - valueFor(a) || a.name.localeCompare(b.name))
    .slice(0, rankingType === 'capitalMarkets' || rankingType === 'commercial' ? 5 : Math.min(Math.max(plan.rankLimit ?? 10, 1), 10));
  if (!rows.length) return clarification(`No positive ${rankingType} ranking values were found for ${year} ${period}.`);

  const kindLabel = rankingType === 'mlas' ? 'MLA'
    : rankingType === 'borrowers' ? 'Borrower'
      : rankingType === 'capitalMarkets' ? 'Capital Markets'
        : 'Commercial';
  const file = rankingType === 'borrowers' ? datasets.rankings.metadata.borrowerSourceFile : datasets.rankings.metadata.mlaSourceFile;
  const registry = createSourceRegistry();
  const citation = registry.addFile(file);
  const lines = rows.map((row, index) => {
    const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(valueFor(row));
    return `${index + 1}. **${row.name}** — ${value} USD millions${row.numberOfDeals ? ` · ${row.numberOfDeals} deals` : ''}`;
  });
  const note = datasets.rankings.metadata.rankedDataNote;
  const answer = `Top ${rows.length} ${kindLabel} results for ${year} ${period}, ranked by ${rankingType === 'capitalMarkets' ? 'Capital Markets total' : rankingType === 'commercial' ? 'Commercial total' : 'total value'} (${datasets.rankings.metadata.amountUnit}).\n${lines.join('\n')}\n${note}${citation ? ` ${citation}` : ''}`;
  const resultNavigation = navigation?.label === PAGE_ROUTES.aviationFinance.label
    ? { label: PAGE_ROUTES.aviationFinance.label, href: `${PAGE_ROUTES.aviationFinance.href}?${new URLSearchParams({ year: String(year), period })}` }
    : navigation;
  return answerWithSources(answer, registry, resultNavigation);
}

function answerAviationAnalysis(plan: AssistantPlan, datasets: AssistantDatasets, navigation?: AssistantNavigation) {
  const { analysis } = datasets;
  const table = analysis.tables.find((candidate) => candidate.id === plan.tableId || normalize(candidate.title) === normalize(plan.tableId ?? ''));
  if (!table) {
    const tables = analysis.tables.map((candidate) => candidate.title).join(', ');
    return clarification(`Which Aviation Finance table are you asking about? Available tables: ${tables}.`);
  }
  const requestedYear = plan.financialYear ? Number(plan.financialYear) : analysis.year;
  if (requestedYear !== analysis.year) {
    return clarification(`The loaded ${table.title} workbook covers ${analysis.year}. I do not have that table for ${requestedYear}.`);
  }
  const periods = unique(table.rows.flatMap((row) => Object.keys(row.values)));
  const period = plan.reportingPeriod && periods.includes(plan.reportingPeriod) ? plan.reportingPeriod : periods.sort(comparePeriods).at(-1);
  if (!period) return clarification(`No reporting period is available for ${table.title}.`);
  const registry = createSourceRegistry();
  const citation = registry.addFile(analysis.sourceFile);
  const lines = table.rows
    .filter((row) => typeof row.values[period] === 'number' && Number.isFinite(row.values[period]))
    .map((row) => {
      const value = row.values[period]!;
      const formatted = row.valueKind === 'percentage'
        ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value * 100)}%`
        : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)} USD billions`;
      return `• **${row.label}**: ${formatted}`;
    });
  if (!lines.length) return clarification(`No ${period} values are present in the loaded ${table.title} table.`);
  const resultNavigation = navigation?.label === PAGE_ROUTES.aviationFinance.label
    ? { label: PAGE_ROUTES.aviationFinance.label, href: `${PAGE_ROUTES.aviationFinance.href}?${new URLSearchParams({ year: String(analysis.year), period })}` }
    : navigation;
  return answerWithSources(`**${table.title} — FY${analysis.year} ${period}**\n${lines.join('\n')}\nSource workbook: ${analysis.sourceFile}${citation ? ` ${citation}` : ''}.`, registry, resultNavigation);
}

function answerNavigation(plan: AssistantPlan, navigation?: AssistantNavigation) {
  if (!navigation) {
    return clarification('Which platform page would you like to open? I can take you to Airline Financials, Financial Statements, Financial Ratios & KPIs, Airline Financial Analytics, or Aviation Finance.');
  }
  return { answer: `Open **${navigation.label}** with the available filters selected.`, sources: [], navigation };
}

export function normalizeAssistantPlan(value: unknown): AssistantPlan {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const intents: AssistantPlan['intent'][] = ['metric_lookup', 'ratio_lookup', 'aviation_ranking', 'aviation_analysis', 'navigation', 'help', 'unsupported'];
  const rankingTypes: NonNullable<AssistantPlan['rankingType']>[] = ['mlas', 'borrowers', 'capitalMarkets', 'commercial'];
  const pages: NonNullable<AssistantPlan['navigateTo']>[] = ['financials', 'statements', 'ratios', 'analytics', 'aviationFinance'];
  const stringOrNull = (candidate: unknown) => typeof candidate === 'string' && candidate.length <= 160 ? candidate.trim() || null : null;
  const airlines = Array.isArray(raw.airlines)
    ? raw.airlines.filter((name): name is string => typeof name === 'string' && name.trim().length > 0 && name.length <= 160).slice(0, 4).map((name) => name.trim())
    : [];
  const rankLimit = typeof raw.rankLimit === 'number' && Number.isFinite(raw.rankLimit) ? Math.floor(raw.rankLimit) : null;
  return {
    intent: intents.includes(raw.intent as AssistantPlan['intent']) ? raw.intent as AssistantPlan['intent'] : 'help',
    airlines,
    metric: stringOrNull(raw.metric),
    financialYear: stringOrNull(raw.financialYear),
    reportingPeriod: stringOrNull(raw.reportingPeriod),
    ratioId: stringOrNull(raw.ratioId),
    rankingType: rankingTypes.includes(raw.rankingType as NonNullable<AssistantPlan['rankingType']>) ? raw.rankingType as AssistantPlan['rankingType'] : null,
    tableId: stringOrNull(raw.tableId),
    rankLimit,
    trend: raw.trend === true,
    navigateTo: pages.includes(raw.navigateTo as NonNullable<AssistantPlan['navigateTo']>) ? raw.navigateTo as AssistantPlan['navigateTo'] : null,
  };
}

export function answerAssistantPlan(plan: AssistantPlan, datasets: AssistantDatasets): AssistantAnswer {
  const navigation = buildNavigation(plan, datasets);
  switch (plan.intent) {
    case 'metric_lookup':
      return answerMetricLookup(plan, datasets, navigation);
    case 'ratio_lookup':
      return answerRatioLookup(plan, datasets, navigation);
    case 'aviation_ranking':
      return answerRanking(plan, datasets, navigation);
    case 'aviation_analysis':
      return answerAviationAnalysis(plan, datasets, navigation);
    case 'navigation':
      return answerNavigation(plan, navigation);
    case 'help':
      return clarification('Ask about a named airline’s reported metric or calculated KPI, historical trends, balance-sheet or profit-and-loss values, Aviation Finance rankings, or the loaded Finance Analysis tables. I use only the data already supplied to this platform and link the source workbook or official source when available.');
    case 'unsupported':
      return clarification('I can answer only from the data loaded in this platform. I cannot verify new figures from the web or rank raw airline amounts across different currencies. Try a named airline, metric, financial year/reporting period, KPI, or Aviation Finance category.');
  }
}

