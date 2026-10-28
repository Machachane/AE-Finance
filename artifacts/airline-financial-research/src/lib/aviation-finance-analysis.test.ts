import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const analysis = JSON.parse(
  readFileSync(new URL('../../public/data/aviation-finance-analysis.json', import.meta.url), 'utf8'),
) as {
  sourceFile: string;
  year: number;
  periods: string[];
  tables: Array<{
    id: string;
    title: string;
    rows: Array<{
      label: string;
      order: number;
      valueKind: string;
      values: Record<string, number>;
    }>;
  }>;
};

test('supplemental aviation finance tables preserve all uploaded periods and rows', () => {
  assert.equal(analysis.year, 2025);
  assert.deepEqual(analysis.periods, ['H1', 'H2', 'YR']);
  assert.deepEqual(analysis.tables.map((table) => table.title), [
    'Facility Analysis',
    'Geographic Analysis',
    'Financier Analysis',
  ]);
  assert.deepEqual(analysis.tables.map((table) => table.rows.length), [7, 5, 5]);

  for (const table of analysis.tables) {
    for (const row of table.rows) {
      assert.deepEqual(Object.keys(row.values).sort(), ['H1', 'H2', 'YR']);
      assert.ok(Number.isFinite(row.values.H1));
      assert.ok(Number.isFinite(row.values.H2));
      assert.ok(Number.isFinite(row.values.YR));
    }
  }

  const facilityTable = analysis.tables[0];
  assert.ok(facilityTable);
  assert.equal(facilityTable.rows[0]?.label, 'Unsecured Notes/Bonds');
  assert.equal(facilityTable.rows[0]?.values.H1, 0.4891082980945336);
  assert.equal(facilityTable.rows[6]?.label, 'Total ($Bn)');
  assert.equal(facilityTable.rows[6]?.values.YR, 133.72625355882352);
});
