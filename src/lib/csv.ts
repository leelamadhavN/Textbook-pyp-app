export type CsvValue = string | number | null | undefined;

export function normalizeCsvCell(value: CsvValue): string {
  return String(value ?? "")
    .replace(/^\ufeff/, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\r\n?|\n|\u2028|\u2029/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function csvEscape(value: CsvValue): string {
  return `"${normalizeCsvCell(value).replace(/"/g, '""')}"`;
}

export function rowsToCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvEscape).join(",")];

  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }

  return `\ufeffsep=,\r\n${lines.join("\r\n")}`;
}
