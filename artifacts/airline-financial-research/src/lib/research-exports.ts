export type ResearchExportRow = {
  metric: string;
  airline: string;
  financialYear: string;
  reportingPeriod: string;
  fiscalYearEnd: string | null;
  currency: string | null;
  status: string | null;
  amount: number | null;
  date: string | null;
  reportingScope: string | null;
  ifrs16Asc842Adoption: string | null;
  inAdministration: string | null;
  sourceUrl: string | null;
  sourceTitle?: string | null;
  verificationStatus: 'verified' | 'unavailable' | 'needs_review';
  note: string | null;
  metricId?: number | null;
  categoryId?: number | null;
  category?: string | null;
  unit?: string | null;
  valueBasis?: string | null;
  reportingEntity?: string | null;
};

export const RESEARCH_EXPORT_COLUMNS: { header: string; key: keyof ResearchExportRow }[] = [
  { header: 'AIRLINE', key: 'airline' },
  { header: 'ID_METRIC', key: 'metricId' },
  { header: 'METRIC', key: 'metric' },
  { header: 'ID_CATEGORY', key: 'categoryId' },
  { header: 'CATEGORY', key: 'category' },
  { header: 'FINANCIAL YEAR', key: 'financialYear' },
  { header: 'REPORTING PERIOD', key: 'reportingPeriod' },
  { header: 'FISCAL YEAR-END', key: 'fiscalYearEnd' },
  { header: 'CURRENCY', key: 'currency' },
  { header: 'STATUS', key: 'status' },
  { header: 'AMOUNT', key: 'amount' },
  { header: 'DATE', key: 'date' },
  { header: 'Reporting Scope', key: 'reportingScope' },
  { header: 'IFRS16/ASC842 Adoption', key: 'ifrs16Asc842Adoption' },
  { header: 'In Administration', key: 'inAdministration' },
  { header: 'UNIT', key: 'unit' },
  { header: 'VALUE BASIS', key: 'valueBasis' },
  { header: 'REPORTING ENTITY', key: 'reportingEntity' },
  { header: 'SOURCE LINK', key: 'sourceUrl' },
  { header: 'SOURCE NOTE', key: 'note' },
  { header: 'VERIFICATION STATUS', key: 'verificationStatus' },
];

function rowValues(row: ResearchExportRow): unknown[] {
  return RESEARCH_EXPORT_COLUMNS.map(({ key }) => row[key]);
}

function escapeXml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildResearchCsvContent(rows: ResearchExportRow[]) {
  const csvCell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [
    RESEARCH_EXPORT_COLUMNS.map(({ header }) => header),
    ...rows.map(rowValues),
  ].map((line) => line.map(csvCell).join(',')).join('\r\n');
}

export function buildResearchXlsxWorksheetParts(rows: ResearchExportRow[]) {
  const allRows = [RESEARCH_EXPORT_COLUMNS.map(({ header }) => header), ...rows.map(rowValues)];
  const sourceColumnIndex = RESEARCH_EXPORT_COLUMNS.findIndex(({ key }) => key === 'sourceUrl');
  const hyperlinks: { ref: string; relationshipId: string; url: string }[] = [];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      if (rowIndex > 0 && columnIndex === sourceColumnIndex && typeof value === 'string' && value.startsWith('http')) {
        hyperlinks.push({ ref: reference, relationshipId: `rId${hyperlinks.length + 1}`, url: value });
      }
      if (typeof value === 'number') return `<c r="${reference}" t="n"><v>${value}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const hyperlinkMarkup = hyperlinks.length
    ? `<hyperlinks>${hyperlinks.map(({ ref, relationshipId }) => `<hyperlink ref="${ref}" r:id="${relationshipId}"/>`).join('')}</hyperlinks>`
    : '';
  const hyperlinkRelationships = hyperlinks.length
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hyperlinks.map(({ relationshipId, url }) => `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>`).join('')}</Relationships>`
    : '';

  return {
    sheetXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${sheetRows}</sheetData>${hyperlinkMarkup}</worksheet>`,
    hyperlinkRelationships,
  };
}
