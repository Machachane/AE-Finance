import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRatioTrendPoints, type RatioSnapshot } from './financial-ratios.ts';

function snapshot(
  airline: string,
  financialYear: string,
  reportingPeriod: string,
  value: number | null,
): RatioSnapshot {
  return {
    airline,
    financialYear,
    reportingPeriod,
    date: null,
    currency: null,
    unit: null,
    fiscalYearEnd: null,
    reportingScope: null,
    reportingEntity: null,
    status: null,
    ifrs16Asc842Adoption: null,
    inAdministration: null,
    ratios: [{
      id: 'ebitda-margin',
      label: 'EBITDA margin',
      category: 'Profitability',
      format: 'percent',
      formula: 'EBITDA / Revenue',
      value,
      note: null,
      indicator: { label: 'Neutral', tone: 'neutral' },
      inputs: [],
    }],
  };
}

test('ratio comparison aligns shared periods and leaves absent airline values unavailable', () => {
  const points = buildRatioTrendPoints([
    {
      key: 'airline-a',
      history: [
        snapshot('Airline A', '2025', 'Q1', 12.5),
        snapshot('Airline A', '2025', 'YR', 14),
      ],
    },
    {
      key: 'airline-b',
      history: [
        snapshot('Airline B', '2025', 'Q1', 10),
        snapshot('Airline B', '2026', 'YR', 16),
      ],
    },
  ], 'ebitda-margin');

  assert.deepEqual(points.map((point) => point.chartLabel), [
    'FY 2025 · Q1',
    'FY 2025 · YR',
    'FY 2026 · YR',
  ]);
  assert.equal(points[0]['airline-a'], 12.5);
  assert.equal(points[0]['airline-b'], 10);
  assert.equal(points[1]['airline-a'], 14);
  assert.equal(points[1]['airline-b'], null);
  assert.equal(points[2]['airline-a'], null);
  assert.equal(points[2]['airline-b'], 16);
});
