export type FinancialRatioRecord = {
  airline: string;
  metric: string;
  amountUsd: number | null;
  currency: string | null;
  unit: string | null;
  financialYear: string;
  reportingPeriod: string;
  fiscalYearEnd: string | null;
  date: string | null;
  status: string | null;
  reportingScope: string | null;
  ifrs16Asc842Adoption: string | null;
  inAdministration: string | null;
  valueBasis: string | null;
  reportingEntity: string | null;
  sourceUrl: string | null;
  note: string | null;
  fxRate?: number | null;
  fxBasis?: string | null;
};

export type RatioFormat = 'percent' | 'multiple';
export type RatioCategory = 'Profitability' | 'Returns' | 'Leverage' | 'Liquidity' | 'Cost mix' | 'Revenue mix';
export type IndicatorTone = 'positive' | 'watch' | 'attention' | 'neutral' | 'unavailable';

export type RatioDefinition = {
  id: string;
  label: string;
  category: RatioCategory;
  format: RatioFormat;
  formula: string;
};

export type RatioResult = RatioDefinition & {
  value: number | null;
  note: string | null;
  indicator: { label: string; tone: IndicatorTone };
  inputs: FinancialRatioRecord[];
};

export type RatioSnapshot = {
  airline: string;
  financialYear: string;
  reportingPeriod: string;
  date: string | null;
  currency: string | null;
  sourceCurrency: string | null;
  unit: string | null;
  fiscalYearEnd: string | null;
  reportingScope: string | null;
  reportingEntity: string | null;
  status: string | null;
  ifrs16Asc842Adoption: string | null;
  inAdministration: string | null;
  ratios: RatioResult[];
};

export type ReportingBasis = {
  key: string;
  label: string;
  latestDate: string | null;
};

export const ALL_PERIODS = '__all_periods__';

const PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR'];

export const RATIO_DEFINITIONS: RatioDefinition[] = [
  { id: 'ebitda-margin', label: 'EBITDA margin', category: 'Profitability', format: 'percent', formula: '(EBIT + Depreciation & Amortisation) / Total Revenue' },
  { id: 'ebit-margin', label: 'EBIT margin', category: 'Profitability', format: 'percent', formula: 'EBIT / Total Revenue' },
  { id: 'operating-margin', label: 'Operating margin', category: 'Profitability', format: 'percent', formula: 'Operating Profit/(Loss) / Total Revenue' },
  { id: 'net-profit-margin', label: 'Net profit margin', category: 'Profitability', format: 'percent', formula: 'Profit / Loss After Tax / Total Revenue' },
  { id: 'roe', label: 'Return on equity (period)', category: 'Returns', format: 'percent', formula: 'Profit / Loss After Tax / Average Total Equity' },
  { id: 'roa', label: 'Return on assets (period)', category: 'Returns', format: 'percent', formula: 'Profit / Loss After Tax / Average Total Assets' },
  { id: 'debt-to-equity', label: 'Reported debt / equity', category: 'Leverage', format: 'multiple', formula: '(Short Term Debt + Long Term Debt & Lease Liabilities) / Total Equity' },
  { id: 'net-debt-ebitda', label: 'Net debt / reported-period EBITDA', category: 'Leverage', format: 'multiple', formula: '(Short Term Debt + Long Term Debt & Lease Liabilities − Cash & Liquid Investments) / (EBIT + Depreciation & Amortisation)' },
  { id: 'liabilities-to-assets', label: 'Total liabilities / assets', category: 'Leverage', format: 'percent', formula: 'Total Liabilities / Total Assets' },
  { id: 'current-ratio', label: 'Current ratio', category: 'Liquidity', format: 'multiple', formula: 'Total Current Assets / Total Current Liabilities' },
  { id: 'cash-ratio', label: 'Cash ratio', category: 'Liquidity', format: 'multiple', formula: 'Cash & Liquid Investments / Total Current Liabilities' },
  { id: 'quick-ratio', label: 'Quick ratio (cash + receivables)', category: 'Liquidity', format: 'multiple', formula: '(Cash & Liquid Investments + Trade Receivables) / Total Current Liabilities' },
  { id: 'interest-coverage', label: 'Interest coverage (net interest)', category: 'Leverage', format: 'multiple', formula: 'EBIT / |Net Interest|' },
  { id: 'fuel-cost-share', label: 'Fuel cost / revenue', category: 'Cost mix', format: 'percent', formula: '|Fuel Costs| / Total Revenue' },
  { id: 'staff-cost-share', label: 'Staff costs / revenue', category: 'Cost mix', format: 'percent', formula: '|Staff Costs| / Total Revenue' },
  { id: 'lease-rent-share', label: 'Lease rents / revenue', category: 'Cost mix', format: 'percent', formula: '|Lease Rents| / Total Revenue' },
  { id: 'other-operating-cost-share', label: 'Other operating costs / revenue', category: 'Cost mix', format: 'percent', formula: '|Other Operating Costs| / Total Revenue' },
  { id: 'passenger-revenue-share', label: 'Passenger revenue share', category: 'Revenue mix', format: 'percent', formula: 'Passenger Revenue / Total Revenue' },
  { id: 'cargo-revenue-share', label: 'Cargo revenue share', category: 'Revenue mix', format: 'percent', formula: 'Cargo Revenue / Total Revenue' },
  { id: 'other-revenue-share', label: 'Other revenue share', category: 'Revenue mix', format: 'percent', formula: 'Other / Unclassified Revenue / Total Revenue' },
];

const BASIS_FIELDS = [
  'airline',
  'reportingScope',
  'reportingEntity',
  'currency',
  'unit',
  'fiscalYearEnd',
] as const;

export function getReportingBasisKey(record: FinancialRatioRecord) {
  return JSON.stringify(BASIS_FIELDS.map((field) => record[field] ?? ''));
}

export function getReportingBases(records: FinancialRatioRecord[], airline: string): ReportingBasis[] {
  const grouped = new Map<string, FinancialRatioRecord[]>();
  for (const record of records) {
    if (record.airline !== airline) continue;
    const key = getReportingBasisKey(record);
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([key, rows]) => {
      const record = rows[0];
      const latestDate = rows.map((row) => row.date).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
      return {
        key,
        latestDate,
        label: [
          record.reportingScope || 'Scope not stated',
          record.reportingEntity || 'Entity not stated',
          record.currency ? `Source currency ${record.currency}` : 'Source currency not stated',
          record.unit || '',
        ].filter(Boolean).join(' · '),
      };
    })
    .sort((a, b) => (b.latestDate ?? '').localeCompare(a.latestDate ?? '') || a.label.localeCompare(b.label));
}

function uniqueRows(rows: Array<FinancialRatioRecord | undefined>): FinancialRatioRecord[] {
  return [...new Set(rows.filter((row): row is FinancialRatioRecord => Boolean(row)))];
}

function disclosure(rows: FinancialRatioRecord[], field: keyof FinancialRatioRecord): string | null {
  const values = [...new Set(rows.map((row) => row[field]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
  if (values.length === 1) return values[0];
  return values.length > 1 ? 'Mixed values in source rows' : null;
}

function indicatorFor(id: string, value: number | null): RatioResult['indicator'] {
  if (value === null || !Number.isFinite(value)) return { label: 'Unavailable', tone: 'unavailable' };
  if (id === 'ebitda-margin' || id === 'ebit-margin' || id === 'operating-margin' || id === 'roe' || id === 'roa' || id === 'net-profit-margin') {
    return value < 0
      ? { label: 'Below zero', tone: 'attention' }
      : { label: 'Above zero', tone: 'positive' };
  }
  if (id === 'current-ratio' || id === 'quick-ratio' || id === 'interest-coverage') {
    return value < 1
      ? { label: 'Below 1.0', tone: 'watch' }
      : { label: 'At least 1.0', tone: 'positive' };
  }
  if (id === 'net-debt-ebitda' && value < 0) return { label: 'Net cash', tone: 'positive' };
  return { label: 'Reference', tone: 'neutral' };
}

function result(
  definition: RatioDefinition,
  value: number | null,
  inputs: FinancialRatioRecord[],
  note: string | null = null,
): RatioResult {
  const safeValue = value !== null && Number.isFinite(value) ? value : null;
  return {
    ...definition,
    value: safeValue,
    note,
    indicator: indicatorFor(definition.id, safeValue),
    inputs: uniqueRows(inputs),
  };
}

function getOpeningBalance(
  allRecords: FinancialRatioRecord[],
  basisKey: string,
  metric: string,
  date: string | null,
): FinancialRatioRecord | undefined {
  if (!date) return undefined;
  return allRecords
    .filter((record) =>
      getReportingBasisKey(record) === basisKey &&
      record.metric === metric &&
      record.reportingPeriod === 'YR' &&
      Boolean(record.date && record.date < date),
    )
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
}

function createSnapshot(
  rows: FinancialRatioRecord[],
  allRecords: FinancialRatioRecord[],
  basisKey: string,
): RatioSnapshot {
  const metrics = new Map(rows.map((row) => [row.metric, row]));
  const first = rows[0];
  const byMetric = (metric: string) => metrics.get(metric);
  const amount = (metric: string) => {
    const value = byMetric(metric)?.amountUsd;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const makeRatio = (
    id: string,
    required: string[],
    calculate: (values: Record<string, number>) => number | null,
    successNote?: string,
    unavailableNote?: string,
  ) => {
    const definition = RATIO_DEFINITIONS.find((candidate) => candidate.id === id)!;
    const inputs = uniqueRows(required.map(byMetric));
    const missing = required.filter((metric) => amount(metric) === null);
    if (missing.length) {
      return result(definition, null, inputs, `Unavailable: missing USD-converted values for ${missing.join(', ')} in this reporting basis.`);
    }
    const values = Object.fromEntries(required.map((metric) => [metric, amount(metric)!]));
    const value = calculate(values);
    if (value === null || !Number.isFinite(value)) {
      return result(definition, null, inputs, unavailableNote || 'Unavailable: the denominator is zero or the ratio is not meaningful for these reported values.');
    }
    return result(definition, value, inputs, successNote || null);
  };

  const revenuePositive = (value: number) => value > 0;
  const periodReturn = (id: 'roe' | 'roa', balanceMetric: 'Total Equity' | 'Total Assets') => {
    const definition = RATIO_DEFINITIONS.find((candidate) => candidate.id === id)!;
    const profitRow = byMetric('Profit / Loss After Tax');
    const closingRow = byMetric(balanceMetric);
    const openingRow = getOpeningBalance(allRecords, basisKey, balanceMetric, first.date);
    const inputs = uniqueRows([profitRow, openingRow, closingRow]);
    if (
      !profitRow || typeof profitRow.amountUsd !== 'number' || !Number.isFinite(profitRow.amountUsd) ||
      !closingRow || typeof closingRow.amountUsd !== 'number' || !Number.isFinite(closingRow.amountUsd) ||
      !openingRow || typeof openingRow.amountUsd !== 'number' || !Number.isFinite(openingRow.amountUsd)
    ) {
      return result(
        definition,
        null,
        inputs,
        `Unavailable: USD-converted ${balanceMetric} at the prior fiscal year-end and current reporting date, plus USD-converted Profit / Loss After Tax, are required.`,
      );
    }
    const average = (openingRow.amountUsd + closingRow.amountUsd) / 2;
    if (average <= 0) return result(definition, null, inputs, `Unavailable: average ${balanceMetric.toLowerCase()} is not positive.`);
    return result(
      definition,
      (profitRow.amountUsd / average) * 100,
      inputs,
      'Period return; not annualised. Uses the prior fiscal year-end and current period-end balance.',
    );
  };

  const netDebtEbitda = makeRatio('net-debt-ebitda', ['Short Term Debt', 'Long Term Debt & Lease Liabilities', 'Cash & Liquid Investments', 'EBIT', 'Depreciation & Amortisation'], (values) => {
    const ebitda = values.EBIT + values['Depreciation & Amortisation'];
    if (ebitda <= 0) return null;
    return (values['Short Term Debt'] + values['Long Term Debt & Lease Liabilities'] - values['Cash & Liquid Investments']) / ebitda;
  }, first.reportingPeriod === 'YR' ? undefined : 'Uses reported-period EBITDA without annualisation; compare like-for-like reporting periods.', 'Unavailable: reported-period EBITDA is zero or negative.');
  if (netDebtEbitda.value !== null && first.reportingPeriod !== 'YR') {
    netDebtEbitda.indicator = { label: 'Interim · not annualised', tone: 'neutral' };
  }

  const results: RatioResult[] = [
    makeRatio('ebitda-margin', ['EBIT', 'Depreciation & Amortisation', 'Total Revenue'], (values) => {
      const revenue = values['Total Revenue'];
      return revenuePositive(revenue) ? ((values.EBIT + values['Depreciation & Amortisation']) / revenue) * 100 : null;
    }, 'EBIT is used as reported; Operating Profit/(Loss) is not substituted.'),
    makeRatio('ebit-margin', ['EBIT', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (values.EBIT / values['Total Revenue']) * 100 : null),
    makeRatio('operating-margin', ['Operating Profit/(Loss)', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (values['Operating Profit/(Loss)'] / values['Total Revenue']) * 100 : null),
    makeRatio('net-profit-margin', ['Profit / Loss After Tax', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (values['Profit / Loss After Tax'] / values['Total Revenue']) * 100 : null),
    periodReturn('roe', 'Total Equity'),
    periodReturn('roa', 'Total Assets'),
    makeRatio('debt-to-equity', ['Short Term Debt', 'Long Term Debt & Lease Liabilities', 'Total Equity'], (values) => {
      if (values['Total Equity'] <= 0) return null;
      return (values['Short Term Debt'] + values['Long Term Debt & Lease Liabilities']) / values['Total Equity'];
    }, 'Long-term debt includes lease liabilities as reported.', 'Unavailable: Total Equity must be positive.'),
    netDebtEbitda,
    makeRatio('liabilities-to-assets', ['Total Liabilities', 'Total Assets'], (values) => values['Total Assets'] > 0 ? (values['Total Liabilities'] / values['Total Assets']) * 100 : null),
    makeRatio('current-ratio', ['Total Current Assets', 'Total Current Liabilities'], (values) => values['Total Current Liabilities'] > 0 ? values['Total Current Assets'] / values['Total Current Liabilities'] : null),
    makeRatio('cash-ratio', ['Cash & Liquid Investments', 'Total Current Liabilities'], (values) => values['Total Current Liabilities'] > 0 ? values['Cash & Liquid Investments'] / values['Total Current Liabilities'] : null),
    makeRatio('quick-ratio', ['Cash & Liquid Investments', 'Trade Receivables', 'Total Current Liabilities'], (values) => values['Total Current Liabilities'] > 0 ? (values['Cash & Liquid Investments'] + values['Trade Receivables']) / values['Total Current Liabilities'] : null, 'Uses only disclosed cash and trade receivables; other quick assets may not be included.'),
    makeRatio('interest-coverage', ['EBIT', 'Net Interest'], (values) => values['Net Interest'] < 0 ? values.EBIT / Math.abs(values['Net Interest']) : null, 'Uses net interest; this is not gross interest coverage.', 'Unavailable: Net Interest is not reported as an expense.'),
    makeRatio('fuel-cost-share', ['Fuel Costs', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (Math.abs(values['Fuel Costs']) / values['Total Revenue']) * 100 : null),
    makeRatio('staff-cost-share', ['Staff Costs', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (Math.abs(values['Staff Costs']) / values['Total Revenue']) * 100 : null),
    makeRatio('lease-rent-share', ['Lease Rents', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (Math.abs(values['Lease Rents']) / values['Total Revenue']) * 100 : null),
    makeRatio('other-operating-cost-share', ['Other Operating Costs', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (Math.abs(values['Other Operating Costs']) / values['Total Revenue']) * 100 : null),
    makeRatio('passenger-revenue-share', ['Passenger Revenue', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (values['Passenger Revenue'] / values['Total Revenue']) * 100 : null),
    makeRatio('cargo-revenue-share', ['Cargo Revenue', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (values['Cargo Revenue'] / values['Total Revenue']) * 100 : null),
    makeRatio('other-revenue-share', ['Other / Unclassified Revenue', 'Total Revenue'], (values) => revenuePositive(values['Total Revenue']) ? (values['Other / Unclassified Revenue'] / values['Total Revenue']) * 100 : null),
  ];

  return {
    airline: first.airline,
    financialYear: first.financialYear,
    reportingPeriod: first.reportingPeriod,
    date: first.date,
    currency: 'USD',
    sourceCurrency: first.currency,
    unit: first.unit,
    fiscalYearEnd: first.fiscalYearEnd,
    reportingScope: first.reportingScope,
    reportingEntity: first.reportingEntity,
    status: disclosure(rows, 'status'),
    ifrs16Asc842Adoption: disclosure(rows, 'ifrs16Asc842Adoption'),
    inAdministration: disclosure(rows, 'inAdministration'),
    ratios: results,
  };
}

export function calculateRatioHistory(
  records: FinancialRatioRecord[],
  airline: string,
  basisKey: string,
  period = ALL_PERIODS,
): RatioSnapshot[] {
  const grouped = new Map<string, FinancialRatioRecord[]>();
  for (const record of records) {
    if (record.airline !== airline || getReportingBasisKey(record) !== basisKey) continue;
    if (period !== ALL_PERIODS && record.reportingPeriod !== period) continue;
    const key = JSON.stringify([record.financialYear, record.reportingPeriod]);
    const group = grouped.get(key) ?? [];
    group.push(record);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map((rows) => createSnapshot(rows, records, basisKey))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.financialYear.localeCompare(b.financialYear) || PERIOD_ORDER.indexOf(a.reportingPeriod) - PERIOD_ORDER.indexOf(b.reportingPeriod));
}

export function getHealthSignals(snapshot: RatioSnapshot): Array<{ label: string; detail: string; tone: IndicatorTone }> {
  const signals: Array<{ label: string; detail: string; tone: IndicatorTone }> = [];
  const value = (id: string) => snapshot.ratios.find((ratio) => ratio.id === id)?.value ?? null;
  const equityRatio = snapshot.ratios.find((ratio) => ratio.id === 'debt-to-equity');

  if (snapshot.inAdministration?.toLowerCase().startsWith('yes')) {
    signals.push({ label: 'Administration disclosed', detail: snapshot.inAdministration, tone: 'attention' });
  }
  if (equityRatio?.note?.includes('Total Equity must be positive')) {
    signals.push({ label: 'Non-positive equity', detail: 'Debt-to-equity is not calculated because reported equity is zero or negative.', tone: 'attention' });
  }
  const ebitdaMargin = value('ebitda-margin');
  if (ebitdaMargin !== null && ebitdaMargin < 0) {
    signals.push({ label: 'Negative EBITDA', detail: 'Reported EBIT plus depreciation and amortisation is below zero for this period.', tone: 'attention' });
  }
  const currentRatio = value('current-ratio');
  if (currentRatio !== null && currentRatio < 1) {
    signals.push({ label: 'Current ratio below 1.0', detail: 'Reported current assets are lower than reported current liabilities.', tone: 'watch' });
  }
  const interestCoverage = value('interest-coverage');
  if (interestCoverage !== null && interestCoverage < 1) {
    signals.push({ label: 'Interest coverage below 1.0', detail: 'Reported EBIT is below the absolute value of disclosed net interest expense.', tone: 'watch' });
  }
  return signals;
}
