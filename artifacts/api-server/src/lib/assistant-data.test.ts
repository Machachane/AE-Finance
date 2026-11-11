import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerAssistantPlan,
  normalizeAssistantPlan,
  groundAssistantFilters,
  type AssistantDatasets,
  type FinancialRecord,
} from './assistant-data';

const sourceUrl = 'https://example-airline.test/investors/annual-report';

function financialRow(
  metric: string,
  amount: number | null,
  overrides: Partial<FinancialRecord> = {},
): FinancialRecord {
  return {
    airline: 'Example Air',
    metric,
    amount,
    currency: 'EUR',
    unit: 'Millions',
    financialYear: '2025',
    reportingPeriod: 'YR',
    fiscalYearEnd: 'Yr End 31 Dec',
    date: '2025-12-31',
    status: 'Actual',
    reportingScope: 'Group Consolidated',
    reportingEntity: 'Example Air Group',
    sourceUrl,
    ...overrides,
  };
}

function datasets(financials: FinancialRecord[]): AssistantDatasets {
  return {
    financials,
    rankings: {
      metadata: {
        mlaSourceFile: 'mla-source.xlsx',
        borrowerSourceFile: 'borrower-source.xlsx',
        amountUnit: 'USD millions',
        rankedDataNote: 'Source workbook totals shown as supplied.',
      },
      mlas: [
        { name: 'Lender A', totalUsdM: 100, numberOfDeals: 3, capitalMarketsUsdM: 65, commercialUsdM: 35, year: 2025, reportingPeriod: 'H1' },
        { name: 'Lender B', totalUsdM: 80, numberOfDeals: 2, capitalMarketsUsdM: 20, commercialUsdM: 60, year: 2025, reportingPeriod: 'H1' },
        { name: 'UNDISCLOSED', totalUsdM: 500, numberOfDeals: 8, capitalMarketsUsdM: 500, commercialUsdM: 0, year: 2025, reportingPeriod: 'H1' },
      ],
      borrowers: [
        { name: 'Borrower A', totalUsdM: 75, numberOfDeals: 2, year: 2025, reportingPeriod: 'H1' },
      ],
    },
    analysis: {
      sourceFile: 'finance-analysis.xlsx',
      year: 2025,
      periods: ['H1', 'H2'],
      tables: [{
        id: 'facility',
        title: 'Facility Analysis',
        rows: [
          { label: 'Unsecured Notes/Bonds', valueKind: 'percentage', values: { H1: 0.5, H2: 0.4 } },
          { label: 'Total ($Bn)', valueKind: 'usdBillions', values: { H1: 50, H2: 60 } },
        ],
      }],
    },
  };
}

test('financial metric answers retain original currency and link the source', () => {
  const plan = normalizeAssistantPlan({
    intent: 'metric_lookup',
    airlines: ['Example Air'],
    metric: 'Total Revenue',
    financialYear: '2025',
    reportingPeriod: 'YR',
  });
  const answer = answerAssistantPlan(plan, datasets([financialRow('Total Revenue', 1000)]));

  assert.match(answer.answer, /1,000 EUR Millions/);
  assert.match(answer.answer, /\[1\]/);
  assert.equal(answer.sources[0]?.url, sourceUrl);
  assert.deepEqual(answer.navigation, { label: 'Financial statements', href: '/statements?airline=Example+Air&metric=Total+Revenue&year=2025&period=YR' });
});

test('an ambiguous multi-currency metric request asks instead of choosing a row', () => {
  const records = [
    financialRow('Total Revenue', 1000),
    financialRow('Total Revenue', 900, { currency: 'USD', reportingEntity: 'Example Air Group USD' }),
  ];
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'metric_lookup',
    airlines: ['Example Air'],
    metric: 'Total Revenue',
    financialYear: '2025',
    reportingPeriod: 'YR',
  }), datasets(records));

  assert.match(answer.answer, /more than one matching reporting basis/);
  assert.equal(answer.sources.length, 0);
});

test('EBITDA margin is calculated deterministically from reported inputs', () => {
  const records = [
    financialRow('EBIT', 300),
    financialRow('Depreciation & Amortisation', 100),
    financialRow('Total Revenue', 1000),
  ];
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'ratio_lookup',
    airlines: ['Example Air'],
    ratioId: 'ebitda-margin',
    financialYear: '2025',
    reportingPeriod: 'YR',
  }), datasets(records));

  assert.match(answer.answer, /EBITDA margin\*\*: 40%/);
  assert.match(answer.answer, /EBIT is used as reported/);
  assert.equal(answer.sources[0]?.url, sourceUrl);
});

test('missing ratio input stays unavailable instead of being treated as zero', () => {
  const records = [
    financialRow('Total Current Assets', null),
    financialRow('Total Current Liabilities', 400),
  ];
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'ratio_lookup',
    airlines: ['Example Air'],
    ratioId: 'current-ratio',
    financialYear: '2025',
    reportingPeriod: 'YR',
  }), datasets(records));

  assert.match(answer.answer, /Current ratio\*\*: Unavailable/);
  assert.match(answer.answer, /missing or ambiguous reported AMOUNT values/);
  assert.doesNotMatch(answer.answer, /Current ratio\*\*: 0/);
});

test('ROE uses the prior year-end and current closing equity', () => {
  const records = [
    financialRow('Total Equity', 600, { financialYear: '2024', date: '2024-12-31' }),
    financialRow('Total Equity', 800),
    financialRow('Profit / Loss After Tax', 150),
  ];
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'ratio_lookup',
    airlines: ['Example Air'],
    ratioId: 'roe',
    financialYear: '2025',
    reportingPeriod: 'YR',
  }), datasets(records));

  assert.match(answer.answer, /Return on equity \(period\)\*\*: 21\.43%/);
  assert.match(answer.answer, /not annualised/);
});

test('Aviation Finance rankings sort supplied totals and cite their workbook', () => {
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'aviation_ranking',
    rankingType: 'capitalMarkets',
    financialYear: '2025',
    reportingPeriod: 'H1',
  }), datasets([]));

  assert.match(answer.answer, /\*\*Lender A\*\* — 65 USD millions/);
  assert.ok(answer.answer.indexOf('Lender A') < answer.answer.indexOf('Lender B'));
  assert.doesNotMatch(answer.answer, /UNDISCLOSED/);
  assert.equal(answer.sources[0]?.label, 'mla-source.xlsx');
  assert.deepEqual(answer.navigation, { label: 'Aviation Finance', href: '/aviation-finance?year=2025&period=H1' });
});

test('finance-analysis tables return period values with workbook citations', () => {
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'aviation_analysis',
    tableId: 'facility',
    financialYear: '2025',
    reportingPeriod: 'H1',
  }), datasets([]));

  assert.match(answer.answer, /Unsecured Notes\/Bonds\*\*: 50%/);
  assert.match(answer.answer, /Total \(\$Bn\)\*\*: 50 USD billions/);
  assert.equal(answer.sources[0]?.label, 'finance-analysis.xlsx');
});

test('ratio navigation carries up to three selected airlines into the ratios tab', () => {
  const records = [
    financialRow('Total Revenue', 1000),
    financialRow('Total Revenue', 1500, { airline: 'Example Jet' }),
    financialRow('Total Revenue', 1800, { airline: 'Example Airways' }),
  ];
  const answer = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'ratio_lookup',
    airlines: ['Example Air', 'Example Jet', 'Example Airways'],
    ratioId: 'ebitda-margin',
    financialYear: '2025',
    reportingPeriod: 'YR',
  }), datasets(records));

  const navigationUrl = new URL(answer.navigation?.href ?? '/', 'https://app.test');
  assert.equal(navigationUrl.pathname, '/ratios');
  assert.equal(navigationUrl.searchParams.get('airline'), 'Example Air');
  assert.deepEqual(navigationUrl.searchParams.getAll('compare'), ['Example Jet', 'Example Airways']);
  assert.equal(navigationUrl.searchParams.get('period'), 'YR');
  assert.equal(navigationUrl.searchParams.get('ratio'), 'ebitda-margin');
});

test('the reported Emirates request repairs omitted or incorrect model filters', () => {
  const data = datasets([
    financialRow('Total Assets', 500, { airline: 'Air Busan' }),
    financialRow('Total Assets', 1000, { airline: 'Emirates' }),
  ]);
  for (const airlines of [[], ['Air Busan']]) {
    const plan = groundAssistantFilters(normalizeAssistantPlan({
      intent: 'navigation', navigateTo: 'statements', airlines,
    }), 'show me emirates balance sheet for fy2025', [], data);
    const result = answerAssistantPlan(plan, data);
    assert.equal(result.navigation?.href, '/statements?airline=Emirates&year=2025&period=YR');
    assert.match(result.answer, /Emirates · FY2025 · YR/);
    assert.doesNotMatch(result.answer, /Air Busan/);
  }
});

test('a second named airline overrides the prior conversation and model selection', () => {
  const data = datasets([
    financialRow('Total Assets', 500, { airline: 'Air Busan' }),
    financialRow('Total Assets', 1000, { airline: 'Emirates' }),
  ]);
  const result = answerAssistantPlan(groundAssistantFilters(normalizeAssistantPlan({
    intent: 'navigation', navigateTo: 'statements', airlines: ['Emirates'],
  }), 'show Air Busan FY2025 YR instead', [
    { role: 'user', content: 'show Emirates FY2025' },
  ], data), data);
  assert.equal(new URL(result.navigation!.href, 'https://app.test').searchParams.get('airline'), 'Air Busan');
});

test('same-airline follow-ups use the user message rather than an assistant mistake', () => {
  const data = datasets([
    financialRow('Total Assets', 500, { airline: 'Air Busan' }),
    financialRow('Total Assets', 1000, { airline: 'Emirates' }),
  ]);
  const plan = groundAssistantFilters(normalizeAssistantPlan({
    intent: 'navigation', navigateTo: 'statements', airlines: ['Air Busan'],
  }), 'show the same airline for FY2025', [
    { role: 'user', content: 'show Emirates balance sheet' },
    { role: 'assistant', content: 'Air Busan is selected' },
  ], data);
  assert.deepEqual(plan.airlines, ['Emirates']);
});

test('the chat grounding-to-answer pipeline preserves mixed known and unknown airlines', () => {
  const data = datasets([financialRow('Total Assets', 1000, { airline: 'Emirates' })]);
  const modelPlan = normalizeAssistantPlan({
    intent: 'navigation', navigateTo: 'statements',
    airlines: ['Emirates', 'Unknown Airways'], financialYear: '2025',
  });
  const plan = groundAssistantFilters(modelPlan,
    'show Emirates and Unknown Airways balance sheets for FY2025', [], data);
  assert.deepEqual(plan.airlines, ['Emirates', 'Unknown Airways']);
  const result = answerAssistantPlan(plan, data);
  assert.equal(result.navigation, undefined);
  assert.match(result.answer, /could not match the requested airline/);
});

test('unavailable navigation filters ask for clarification without an action', () => {
  const data = datasets([financialRow('Total Assets', 1000)]);
  for (const fields of [
    { airlines: ['Unknown Airways'] },
    { airlines: [] },
    { financialYear: '2026' },
    { reportingPeriod: 'Q1' },
    { reportingPeriod: 'Q9' },
  ]) {
    const result = answerAssistantPlan(normalizeAssistantPlan({
      intent: 'navigation', navigateTo: 'statements', airlines: ['Example Air'],
      financialYear: '2025', ...fields,
    }), data);
    assert.equal(result.navigation, undefined);
  }
});

test('ambiguous statement years or periods are not silently defaulted', () => {
  const data = datasets([
    financialRow('Total Assets', 1000),
    financialRow('Total Assets', 800, { financialYear: '2026', reportingPeriod: 'H1' }),
    financialRow('Total Assets', 900, { financialYear: '2026', reportingPeriod: 'YR' }),
  ]);
  for (const financialYear of [null, '2026']) {
    const result = answerAssistantPlan(normalizeAssistantPlan({
      intent: 'navigation', navigateTo: 'statements', airlines: ['Example Air'], financialYear,
    }), data);
    assert.equal(result.navigation, undefined);
    assert.match(result.answer, /Which/);
  }
});

test('an unavailable airline-year-period combination is rejected even if the period exists elsewhere', () => {
  const data = datasets([
    financialRow('Total Assets', 1000),
    financialRow('Total Assets', 800, { financialYear: '2026', reportingPeriod: 'H1' }),
  ]);
  const result = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'navigation', navigateTo: 'statements', airlines: ['Example Air'],
    financialYear: '2025', reportingPeriod: 'H1',
  }), data);
  assert.equal(result.navigation, undefined);
});

test('Aviation Finance preserves analysis-only periods and rejects unavailable combinations', () => {
  const data = datasets([]);
  const result = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'navigation', navigateTo: 'aviationFinance', financialYear: '2025', reportingPeriod: 'H2',
  }), data);
  assert.equal(result.navigation?.href, '/aviation-finance?year=2025&period=H2');
  const unavailable = answerAssistantPlan(normalizeAssistantPlan({
    intent: 'navigation', navigateTo: 'aviationFinance', financialYear: '2026', reportingPeriod: 'H2',
  }), data);
  assert.equal(unavailable.navigation, undefined);
});
