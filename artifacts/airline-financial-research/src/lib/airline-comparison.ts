import {
  calculateRatioHistory,
  getReportingBases,
  type FinancialRatioRecord,
  type RatioSnapshot,
} from './financial-ratios.ts';

export const COMPARISON_PERIOD_ORDER = [
  'Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '4M', '6M', '9M', '10M', '15M', 'YR',
];

export type ComparisonDimension =
  | 'profitability'
  | 'leverage'
  | 'liquidity'
  | 'revenueGrowth'
  | 'financialStability';

export type ComparisonValue = {
  value: number | null;
  rank: number | null;
  observedSignals?: number;
};

export type AirlineComparisonRow = {
  airline: string;
  basisKey: string | null;
  basisLabel: string | null;
  snapshot: RatioSnapshot | null;
  revenueGrowth: number | null;
  revenueGrowthNote: string | null;
  revenueGrowthInputs: FinancialRatioRecord[];
  stabilityScore: number | null;
  stabilitySignalsAvailable: number;
  excludedReason: string | null;
  rankings: Record<ComparisonDimension, ComparisonValue>;
};

export type ScopeCoverage = {
  scope: string;
  airlineCount: number;
};

const EMPTY_RANKINGS: Record<ComparisonDimension, ComparisonValue> = {
  profitability: { value: null, rank: null },
  leverage: { value: null, rank: null },
  liquidity: { value: null, rank: null },
  revenueGrowth: { value: null, rank: null },
  financialStability: { value: null, rank: null, observedSignals: 0 },
};

function matchingPeriodRows(
  records: FinancialRatioRecord[],
  airline: string,
  year: string,
  period: string,
  scope: string,
) {
  return records.filter((record) =>
    record.airline === airline &&
    record.financialYear === year &&
    record.reportingPeriod === period &&
    record.reportingScope === scope,
  );
}

function availableBases(
  records: FinancialRatioRecord[],
  airline: string,
  year: string,
  period: string,
  scope: string,
) {
  const availableKeys = new Set(
    matchingPeriodRows(records, airline, year, period, scope).map((record) =>
      JSON.stringify([
        record.airline,
        record.reportingScope ?? '',
        record.reportingEntity ?? '',
        record.currency ?? '',
        record.unit ?? '',
        record.fiscalYearEnd ?? '',
      ]),
    ),
  );
  return getReportingBases(records, airline)
    .filter((basis) => basis.label && availableKeys.has(basis.key))
    .filter((basis) => records.some((record) =>
      record.airline === airline &&
      record.financialYear === year &&
      record.reportingPeriod === period &&
      record.reportingScope === scope &&
      JSON.stringify([
        record.airline,
        record.reportingScope ?? '',
        record.reportingEntity ?? '',
        record.currency ?? '',
        record.unit ?? '',
        record.fiscalYearEnd ?? '',
      ]) === basis.key,
    ));
}

export function getComparisonScopes(
  records: FinancialRatioRecord[],
  airlines: string[],
  year: string,
  period: string,
): ScopeCoverage[] {
  const coverage = new Map<string, Set<string>>();
  for (const airline of airlines) {
    const scopes = new Set(records
      .filter((record) =>
        record.airline === airline &&
        record.financialYear === year &&
        record.reportingPeriod === period &&
        record.reportingScope,
      )
      .map((record) => record.reportingScope!));
    for (const scope of scopes) {
      const airlineSet = coverage.get(scope) ?? new Set<string>();
      airlineSet.add(airline);
      coverage.set(scope, airlineSet);
    }
  }
  return [...coverage.entries()]
    .map(([scope, airlineSet]) => ({ scope, airlineCount: airlineSet.size }))
    .sort((a, b) => b.airlineCount - a.airlineCount || a.scope.localeCompare(b.scope));
}

function metricRecord(
  records: FinancialRatioRecord[],
  airline: string,
  basisKey: string,
  year: string,
  period: string,
  metric: string,
): number | null {
  const rows = records.filter((record) =>
    record.airline === airline &&
    record.financialYear === year &&
    record.reportingPeriod === period &&
    record.metric === metric &&
    JSON.stringify([
      record.airline,
      record.reportingScope ?? '',
      record.reportingEntity ?? '',
      record.currency ?? '',
      record.unit ?? '',
      record.fiscalYearEnd ?? '',
    ]) === basisKey,
  );
  return rows.length === 1 && typeof rows[0].amount === 'number' && Number.isFinite(rows[0].amount)
    ? rows[0]
    : null;
}

function ratioValue(snapshot: RatioSnapshot | null, id: string): number | null {
  return snapshot?.ratios.find((ratio) => ratio.id === id)?.value ?? null;
}

function compareRow(
  records: FinancialRatioRecord[],
  airline: string,
  year: string,
  period: string,
  scope: string,
  selectedBasisKey?: string,
): AirlineComparisonRow {
  const bases = availableBases(records, airline, year, period, scope);
  let basisKey: string | null = null;
  let basisLabel: string | null = null;
  let excludedReason: string | null = null;

  if (bases.length === 0) {
    excludedReason = 'No workbook data for this year, period and reporting scope.';
  } else if (selectedBasisKey && bases.some((basis) => basis.key === selectedBasisKey)) {
    basisKey = selectedBasisKey;
    basisLabel = bases.find((basis) => basis.key === selectedBasisKey)?.label ?? null;
  } else if (bases.length === 1) {
    basisKey = bases[0].key;
    basisLabel = bases[0].label;
  } else {
    excludedReason = 'Multiple reporting bases are available; select a basis before ranking.';
  }

  let snapshot: RatioSnapshot | null = null;
  if (basisKey) {
    const basisRows = matchingPeriodRows(records, airline, year, period, scope).filter((record) =>
      JSON.stringify([
        record.airline,
        record.reportingScope ?? '',
        record.reportingEntity ?? '',
        record.currency ?? '',
        record.unit ?? '',
        record.fiscalYearEnd ?? '',
      ]) === basisKey,
    );
    const metricCounts = new Map<string, number>();
    basisRows.forEach((row) => metricCounts.set(row.metric, (metricCounts.get(row.metric) ?? 0) + 1));
    const duplicates = [...metricCounts].filter(([, count]) => count > 1).map(([metric]) => metric);
    if (duplicates.length) {
      excludedReason = `Duplicate source rows need review: ${duplicates.join(', ')}.`;
      basisKey = null;
      basisLabel = null;
    } else {
      snapshot = calculateRatioHistory(records, airline, basisKey, period)
        .find((candidate) => candidate.financialYear === year && candidate.reportingPeriod === period) ?? null;
      if (!snapshot) excludedReason = 'A complete reporting snapshot is not available.';
    }
  }

  let revenueGrowth: number | null = null;
  let revenueGrowthNote: string | null = null;
  let revenueGrowthInputs: FinancialRatioRecord[] = [];
  if (basisKey) {
    const priorYear = String(Number(year) - 1);
    const currentRevenue = metricRecord(records, airline, basisKey, year, period, 'Total Revenue');
    const priorRevenue = metricRecord(records, airline, basisKey, priorYear, period, 'Total Revenue');
    revenueGrowthInputs = [currentRevenue, priorRevenue].filter(
      (record): record is FinancialRatioRecord => record !== null,
    );
    if (!currentRevenue) {
      revenueGrowthNote = 'Current-period Total Revenue is missing or duplicated.';
    } else if (!priorRevenue) {
      revenueGrowthNote = `Comparable ${priorYear} Total Revenue is missing or duplicated on this reporting basis.`;
    } else if (priorRevenue.amount! <= 0) {
      revenueGrowthNote = `Comparable ${priorYear} Total Revenue is not positive.`;
    } else {
      revenueGrowth = ((currentRevenue.amount! / priorRevenue.amount!) - 1) * 100;
      revenueGrowthNote = 'Year-over-year change on the same currency, unit and reporting basis.';
    }
  }

  const stabilitySignals: Array<boolean | null> = [
    ratioValue(snapshot, 'ebitda-margin') === null ? null : ratioValue(snapshot, 'ebitda-margin')! > 0,
    ratioValue(snapshot, 'debt-to-equity') === null ? null : ratioValue(snapshot, 'debt-to-equity')! <= 1,
    ratioValue(snapshot, 'current-ratio') === null ? null : ratioValue(snapshot, 'current-ratio')! >= 1,
    ratioValue(snapshot, 'interest-coverage') === null ? null : ratioValue(snapshot, 'interest-coverage')! >= 1,
  ];
  const stabilitySignalsAvailable = stabilitySignals.filter((signal) => signal !== null).length;
  const stabilityScore = stabilitySignalsAvailable === stabilitySignals.length
    ? stabilitySignals.filter(Boolean).length
    : null;

  return {
    airline,
    basisKey,
    basisLabel,
    snapshot,
    revenueGrowth,
    revenueGrowthNote,
    revenueGrowthInputs,
    stabilityScore,
    stabilitySignalsAvailable,
    excludedReason,
    rankings: {
      profitability: { value: ratioValue(snapshot, 'ebitda-margin'), rank: null },
      leverage: { value: ratioValue(snapshot, 'debt-to-equity'), rank: null },
      liquidity: { value: ratioValue(snapshot, 'current-ratio'), rank: null },
      revenueGrowth: { value: revenueGrowth, rank: null },
      financialStability: {
        value: stabilityScore,
        rank: null,
        observedSignals: stabilitySignalsAvailable,
      },
    },
  };
}

function rankDimension(
  rows: AirlineComparisonRow[],
  dimension: ComparisonDimension,
  direction: 'asc' | 'desc',
) {
  const ranked = rows
    .filter((row) => row.rankings[dimension].value !== null)
    .sort((a, b) => {
      const difference = a.rankings[dimension].value! - b.rankings[dimension].value!;
      return (direction === 'desc' ? -difference : difference) || a.airline.localeCompare(b.airline);
    });
  let previousValue: number | null = null;
  let previousRank = 0;
  ranked.forEach((row, index) => {
    const value = row.rankings[dimension].value!;
    const rank = value === previousValue ? previousRank : index + 1;
    row.rankings[dimension].rank = rank;
    previousValue = value;
    previousRank = rank;
  });
}

export function buildAirlineComparison(
  records: FinancialRatioRecord[],
  airlines: string[],
  year: string,
  period: string,
  scope: string,
  selectedBasisByAirline: Record<string, string> = {},
): AirlineComparisonRow[] {
  const rows = airlines.map((airline) =>
    compareRow(records, airline, year, period, scope, selectedBasisByAirline[airline]),
  );
  rankDimension(rows, 'profitability', 'desc');
  rankDimension(rows, 'leverage', 'asc');
  rankDimension(rows, 'liquidity', 'desc');
  rankDimension(rows, 'revenueGrowth', 'desc');
  rankDimension(rows, 'financialStability', 'desc');
  return rows;
}

export function getAvailableComparisonPeriods(records: FinancialRatioRecord[], year: string) {
  return [...new Set(records.filter((record) => record.financialYear === year).map((record) => record.reportingPeriod))]
    .sort((a, b) => {
      const aIndex = COMPARISON_PERIOD_ORDER.indexOf(a);
      const bIndex = COMPARISON_PERIOD_ORDER.indexOf(b);
      return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
    });
}

export function getBasisOptions(
  records: FinancialRatioRecord[],
  airline: string,
  year: string,
  period: string,
  scope: string,
) {
  return availableBases(records, airline, year, period, scope);
}
