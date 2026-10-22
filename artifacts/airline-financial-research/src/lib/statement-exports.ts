export type StatementExportRow = {
  airline: string;
  metric: string;
  amount: number | null;
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
  verificationStatus: string;
};

const columns: { header: string; key: keyof StatementExportRow }[] = [
  { header: 'AIRLINE', key: 'airline' },
  { header: 'METRIC', key: 'metric' },
  { header: 'AMOUNT', key: 'amount' },
  { header: 'AMOUNT (USD)', key: 'amountUsd' },
  { header: 'CURRENCY', key: 'currency' },
  { header: 'UNIT', key: 'unit' },
  { header: 'FINANCIAL YEAR', key: 'financialYear' },
  { header: 'REPORTING PERIOD', key: 'reportingPeriod' },
  { header: 'FISCAL YEAR-END', key: 'fiscalYearEnd' },
  { header: 'DATE', key: 'date' },
  { header: 'STATUS', key: 'status' },
  { header: 'REPORTING SCOPE', key: 'reportingScope' },
  { header: 'IFRS16/ASC842 ADOPTION', key: 'ifrs16Asc842Adoption' },
  { header: 'IN ADMINISTRATION', key: 'inAdministration' },
  { header: 'VALUE BASIS', key: 'valueBasis' },
  { header: 'REPORTING ENTITY', key: 'reportingEntity' },
  { header: 'SOURCE LINK', key: 'sourceUrl' },
  { header: 'SOURCE NOTE', key: 'note' },
  { header: 'VERIFICATION STATUS', key: 'verificationStatus' },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function exportStatementCsv(rows: StatementExportRow[], title: string, airline: string, year: string, period: string) {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => row[column.key]))]
    .map((line) => line.map(cell).join(',')).join('\r\n');
  downloadBlob(
    new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
    `${safeName(airline)}-${year}-${safeName(period)}-${safeName(title)}.csv`,
  );
}

function escapeXml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ -1) >>> 0;
}

function makeZip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, position: number, value: number) => view.setUint16(position, value, true);
  const u32 = (view: DataView, position: number, value: number) => view.setUint32(position, value, true);
  for (const { name, content } of files) {
    const filename = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + filename.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u32(lv, 14, checksum); u32(lv, 18, data.length); u32(lv, 22, data.length);
    u16(lv, 26, filename.length); u16(lv, 28, 0); local.set(filename, 30);
    localParts.push(local, data);
    const central = new Uint8Array(46 + filename.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u32(cv, 16, checksum); u32(cv, 20, data.length); u32(cv, 24, data.length);
    u16(cv, 28, filename.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0);
    u32(cv, 38, 0); u32(cv, 42, offset); central.set(filename, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
  const buffers = [...localParts, ...centralParts, end].map((bytes) => {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  });
  return new Blob(buffers, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportStatementXlsx(rows: StatementExportRow[], title: string, airline: string, year: string, period: string) {
  const allRows = [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => row[column.key]))];
  const sourceColumn = columns.findIndex((column) => column.key === 'sourceUrl');
  const hyperlinks: { ref: string; id: string; url: string }[] = [];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      if (rowIndex > 0 && columnIndex === sourceColumn && typeof value === 'string' && value.startsWith('http')) {
        hyperlinks.push({ ref, id: `rId${hyperlinks.length + 1}`, url: value });
      }
      return typeof value === 'number'
        ? `<c r="${ref}" t="n"><v>${value}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const links = hyperlinks.length
    ? `<hyperlinks>${hyperlinks.map(({ ref, id }) => `<hyperlink ref="${ref}" r:id="${id}"/>`).join('')}</hyperlinks>`
    : '';
  const relations = hyperlinks.length
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hyperlinks.map(({ id, url }) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>`).join('')}</Relationships>`
    : '';
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(title.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${sheetRows}</sheetData>${links}</worksheet>` },
    ...(relations ? [{ name: 'xl/worksheets/_rels/sheet1.xml.rels', content: relations }] : []),
  ];
  downloadBlob(makeZip(files), `${safeName(airline)}-${year}-${safeName(period)}-${safeName(title)}.xlsx`);
}
