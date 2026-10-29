import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAirlineComparison,
  getAvailableComparisonPeriods,
  getComparisonScopes,
} from './airline-comparison.ts';
import type { FinancialRatioRecord } from './financial-ratios.ts';

function record(
  airline: string,
  financialYear: string,
  metric: string,
  amount: number,
  currency: string,
): FinancialRatioRecord {
  return {
    airline,
    metric,
    amount,
    currency,
    unit: 'Millions',
    financialYear,
    reportingPeriod: 'YR',
    fiscalYearEnd: '31 Dec',
    date: `${financialYear}-12-31`,
    status: 'Actual',
    reportingScope: 'Group Consolidated',
    ifrs16Asc842Adoption: null,
    inAdministration: null,
    valueBasis: 'Reported',
    reportingEntity: `${airline} Group`,
    sourceUrl: `https://example.com/${airline.toLowerCase().replaceAll(' ', '-')}`,
    note: null,
  };
}

function sampleRecords() {
  const rows: FinancialRatioRecord[] = [];
  for (const [airline, currency, priorRevenue, revenue, ebit] of [
    ['North Air', 'GBP', 800, 1000, 100],
    ['South Air', 'USD', 500, 750, 60],
  ] as const) {
    rows.push(record(airline, '2025', 'Total Revenue', priorRevenue, currency));
    rows.push(
      record(airline, '2026', 'Total Revenue', revenue, currency),
      record(airline, '2026', 'EBIT', ebit, currency),
      record(airline, '2026', 'Depreciation & Amortisation', 20, currency),
      record(airline, '2026', 'Short Term Debt', 100, currency),
      record(airline, '2026', 'Long Term Debt & Lease Liabilities', 300, currency),
      record(airline, '2026', 'Total Equity', 400, currency),
      record(airline, '2026', 'Total Current Assets', 200, currency),
      record(airline, '2026', 'Total Current Liabilities', 100, currency),
      record(airline, '2026', 'Cash & Liquid Investments', 50, currency),
      record(airline, '2026', 'Trade Receivables', 30, currency),
      record(airline, '2026', 'Net Interest', -20, currency),
      record(airline, '2026', 'Profit / Loss After Tax', ebit * 0.6, currency),
      record(airline, '2026', 'Total Assets', 900, currency),
      record(airline, '2026', 'Total Liabilities', 500, currency),
      record(airline, '2026', 'Operating Profit/(Loss)', ebit * 0.9, currency),
    );
  }
  return rows;
}

test('comparison scopes and reporting periods come from matching workbook rows', () => {
  const rows = sampleRecords();
  assert.deepEqual(getAvailableComparisonPeriods(rows, '2026'), ['YR']);
  assert.deepEqual(
    getComparisonScopes(rows, ['North Air', 'South Air'], '2026', 'YR'),
    [{ scope: 'Group Consolidated', airlineCount: 2 }],
  );
});

test('comparison ranks use same-period ratios and same-basis year-over-year growth', () => {
  const rows = sampleRecords();
  const result = buildAirlineComparison(
    rows,
    ['North Air', 'South Air'],
    '2026',
    'YR',
    'Group Consolidated',
  );
  const north = result.find((row) => row.airline === 'North Air');
  const south = result.find((row) => row.airline === 'South Air');

  assert.equal(north?.revenueGrowth, 25);
  assert.equal(south?.revenueGrowth, 50);
  assert.equal(north?.rankings.profitability.value, 12);
  assert.equal(north?.rankings.leverage.value, 1);
  assert.equal(north?.rankings.liquidity.value, 2);
  assert.equal(north?.rankings.financialStability.value, 4);
  assert.equal(north?.rankings.profitability.rank, 1);
  assert.equal(south?.rankings.revenueGrowth.rank, 1);
  assert.equal(north?.snapshot?.currency, 'GBP');
  assert.equal(south?.snapshot?.currency, 'USD');
});

test('2025 revenue growth is unavailable when prior-year data is absent', () => {
  const rows = sampleRecords();
  const result = buildAirlineComparison(
    rows,
    ['North Air'],
    '2025',
    'YR',
    'Group Consolidated',
  );
  assert.equal(result[0]?.revenueGrowth, null);
  assert.match(result[0]?.revenueGrowthNote ?? '', /2024/);
});
