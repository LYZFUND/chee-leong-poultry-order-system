function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','));
  const csv = [headers.join(','), ...body].join('\n');
  downloadCsvText(filename, csv);
}

export function downloadCsvMatrix(filename: string, rows: unknown[][]): void {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  downloadCsvText(filename, csv);
}

function downloadCsvText(filename: string, csv: string): void {
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
