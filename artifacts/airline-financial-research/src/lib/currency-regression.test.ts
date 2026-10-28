import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateRatioHistory,
  getReportingBases,
  type FinancialRatioRecord,
} from './financial-ratios.ts';
import {
  buildResearchCsvContent,
  buildResearchXlsxWorksheetParts,
  type ResearchExportRow,
} from './research-exports.ts';
import {
  buildStatementCsvContent,
  buildStatementXlsxWorksheetParts,
  type StatementExportRow,
} from './statement-exports.ts';

const researchRow: ResearchExportRow & { amountUsd: number } = {
  airline: 'Example Air',
  metric: 'Total Revenue',
  metricId: 1,
  categoryId: 2,
  category: 'Revenue',
  financialYear: '2025',
  reportingPeriod: 'YR',
  fiscalYearEnd: '2025-12-31',
  currency: 'EUR',
  status: 'Reported',
  amount: 1234.56,
  amountUsd: 98765.43,
  date: '2025-12-31',
  reportingScope: 'Consolidated',
  ifrs16Asc842Adoption: null,
  inAdministration: null,
  unit: 'thousands',
  valueBasis: 'Reported',
  reportingEntity: 'Example Air Group',
  sourceUrl: 'https://example.com/filing?a=1&b=2',
  note: null,
  verificationStatus: 'verified',
};

const statementRow: StatementExportRow & { amountUsd: number } = {
  airline: 'Example Air',
  metric: 'Total Revenue',
  financialYear: '2025',
  reportingPeriod: 'YR',
  fiscalYearEnd: '2025-12-31',
  currency: 'EUR',
  status: 'Reported',
  amount: 1234.56,
  amountUsd: 98765.43,
  date: '2025-12-31',
  reportingScope: 'Consolidated',
  ifrs16Asc842Adoption: null,
  inAdministration: null,
  valueBasis: 'Reported',
  reportingEntity: 'Example Air Group',
  sourceUrl: 'https://example.com/filing?a=1&b=2',
  note: null,
  verificationStatus: 'verified',
  unit: 'thousands',
};

function ratioRecord(overrides: Partial<FinancialRatioRecord>): FinancialRatioRecord {
  return {
    airline: 'Example Air',
    metric: 'EBIT',
    amount: null,
    currency: 'GBP',
    unit: 'millions',
    financialYear: '2025',
    reportingPeriod: 'YR',
    fiscalYearEnd: '2025-12-31',
    date: '2025-12-31',
    status: null,
    reportingScope: 'Consolidated',
    ifrs16Asc842Adoption: null,
    inAdministration: null,
    valueBasis: 'Reported',
    reportingEntity: 'Example Air Group',
    sourceUrl: null,
    note: null,
    ...overrides,
  };
}

function csvRow(csv: string, headerName: string) {
  const [header, data] = csv.split('\r\n');
  assert.ok(header && data, 'CSV should contain a header and source row');
  const headers = header.split(',').map((cell) => cell.replace(/^"|"$/g, ''));
  const values = data.split(',').map((cell) => cell.replace(/^"|"$/g, ''));
  return values[headers.indexOf(headerName)];
}

test('research CSV serializes the reported AMOUNT, CURRENCY, and UNIT', () => {
  const csv = buildResearchCsvContent([researchRow]);
  assert.equal(csvRow(csv, 'AMOUNT'), '1234.56');
  assert.equal(csvRow(csv, 'CURRENCY'), 'EUR');
  assert.equal(csvRow(csv, 'UNIT'), 'thousands');
  assert.ok(!csv.includes('98765.43'), 'converted USD field must not be exported');
  assert.ok(!csv.includes('amountUsd'), 'converted USD field must not appear in exported columns');
});

test('research XLSX worksheet serializes the reported AMOUNT and CURRENCY', () => {
  const { sheetXml, hyperlinkRelationships } = buildResearchXlsxWorksheetParts([researchRow]);
  const amountIndex = 11; // AMOUNT is column K in this workbook.
  const currencyIndex = 9; // CURRENCY is column I in this workbook.
  assert.ok(sheetXml.includes(`<c r="K1" t="inlineStr"><is><t xml:space="preserve">AMOUNT</t></is></c>`));
  assert.ok(sheetXml.includes(`<c r="K2" t="n"><v>${researchRow.amount}</v></c>`));
  assert.ok(sheetXml.includes(`<c r="I2" t="inlineStr"><is><t xml:space="preserve">${researchRow.currency}</t></is></c>`));
  assert.ok(sheetXml.includes(`<c r="${String.fromCharCode(64 + amountIndex)}2"`));
  assert.ok(sheetXml.includes(`<c r="${String.fromCharCode(64 + currencyIndex)}2"`));
  assert.ok(!sheetXml.includes(String(researchRow.amountUsd)), 'converted USD field must not be exported');
  assert.ok(hyperlinkRelationships.includes('https://example.com/filing?a=1&amp;b=2'));
});

test('statements CSV serializes the reported AMOUNT, CURRENCY, and UNIT', () => {
  const csv = buildStatementCsvContent([statementRow]);
  assert.equal(csvRow(csv, 'AMOUNT'), '1234.56');
  assert.equal(csvRow(csv, 'CURRENCY'), 'EUR');
  assert.equal(csvRow(csv, 'UNIT'), 'thousands');
  assert.ok(!csv.includes('98765.43'), 'converted USD field must not be exported');
  assert.ok(!csv.includes('amountUsd'), 'converted USD field must not appear in exported columns');
});

test('statements XLSX worksheet serializes the reported AMOUNT and CURRENCY', () => {
  const { sheetXml, hyperlinkRelationships } = buildStatementXlsxWorksheetParts([statementRow]);
  assert.ok(sheetXml.includes('<c r="C1" t="inlineStr"><is><t xml:space="preserve">AMOUNT</t></is></c>'));
  assert.ok(sheetXml.includes(`<c r="C2" t="n"><v>${statementRow.amount}</v></c>`));
  assert.ok(sheetXml.includes(`<c r="D2" t="inlineStr"><is><t xml:space="preserve">${statementRow.currency}</t></is></c>`));
  assert.ok(!sheetXml.includes(String(statementRow.amountUsd)), 'converted USD field must not be exported');
  assert.ok(hyperlinkRelationships.includes('https://example.com/filing?a=1&amp;b=2'));
});

test('ratio histories separate rows by source currency and unit', () => {
  const rows = [
    ratioRecord({ metric: 'EBIT', amount: 200, currency: 'GBP', unit: 'millions' }),
    ratioRecord({ metric: 'Total Revenue', amount: 1000, currency: 'GBP', unit: 'millions' }),
    ratioRecord({ metric: 'EBIT', amount: 10000, currency: 'USD', unit: 'millions' }),
    ratioRecord({ metric: 'Total Revenue', amount: 20000, currency: 'USD', unit: 'millions' }),
    ratioRecord({ metric: 'EBIT', amount: 900000, currency: 'GBP', unit: 'thousands' }),
    ratioRecord({ metric: 'Total Revenue', amount: 1000000, currency: 'GBP', unit: 'thousands' }),
  ];
  const bases = getReportingBases(rows, 'Example Air');
  assert.equal(bases.length, 3, 'each currency/unit combination must have its own basis');

  const results = bases.map((basis) => {
    const [snapshot] = calculateRatioHistory(rows, 'Example Air', basis.key);
    assert.ok(snapshot);
    const ebitMargin = snapshot.ratios.find((ratio) => ratio.id === 'ebit-margin');
    assert.equal(ebitMargin?.value, snapshot.currency === 'USD' ? 50 : snapshot.unit === 'thousands' ? 90 : 20);
    assert.equal(ebitMargin?.inputs.length, 2);
    assert.ok(ebitMargin?.inputs.every((input) =>
      input.currency === snapshot.currency && input.unit === snapshot.unit,
    ), 'a ratio must include only rows matching its currency and unit');
    return snapshot;
  });
  assert.equal(results.length, 3);
});

test('financial tables and analytics read source amounts and retain their currency basis', () => {
  const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
  const statements = readFileSync(new URL('../pages/Statements.tsx', import.meta.url), 'utf8');
  const ratios = readFileSync(new URL('../pages/FinancialRatios.tsx', import.meta.url), 'utf8');
  const analytics = readFileSync(new URL('../pages/AirlineAnalytics.tsx', import.meta.url), 'utf8');
  const ratioLibrary = readFileSync(new URL('./financial-ratios.ts', import.meta.url), 'utf8');

  assert.ok(home.includes('amount: record.amount'));
  assert.ok(home.includes('currency: record.currency'));
  assert.ok(home.includes('formatAmount(row)'));
  assert.ok(home.includes('{row.currency ||'));
  assert.ok(statements.includes('{formatAmount(row)}'));
  assert.ok(statements.includes('{row.currency ||'));
  assert.ok(ratios.includes('record.amount'));
  assert.ok(ratios.includes('input.currency'));
  assert.ok(analytics.includes('record.amount'));
  assert.ok(analytics.includes('record?.currency'));
  assert.ok(ratioLibrary.includes("'currency'"));
  assert.ok(ratioLibrary.includes("'unit'"));
});

test('research, statements, ratios, and analytics do not reference converted USD amount fields', () => {
  const paths = [
    '../pages/Home.tsx',
    '../pages/Statements.tsx',
    '../pages/FinancialRatios.tsx',
    '../pages/AirlineAnalytics.tsx',
    './financial-ratios.ts',
    './statement-exports.ts',
    './research-exports.ts',
  ];
  const convertedAmountField = /(?:\b(?:usd|converted)[A-Z_]*amount\b|\bamount[A-Z_]*(?:usd|converted)\b)/i;

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, convertedAmountField, `${path} must use source AMOUNT instead of converted USD fields`);
  }
});
