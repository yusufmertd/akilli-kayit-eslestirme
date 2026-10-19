// Dosya okuma ve indirme. Her şey tarayıcı belleğinde olur: dosya hiçbir sunucuya gönderilmez,
// localStorage / IndexedDB gibi kalıcı bir yere yazılmaz. Sayfa kapanınca veri yok olur.

import * as XLSX from 'xlsx';

// Excel veya CSV dosyasını sayfalar listesine çevirir: [{ name, headers, rows }]
export async function readFile(file) {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string' })
    : XLSX.read(buffer, { type: 'array' });

  return wb.SheetNames.map((name) => {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false });
    const [headers = [], ...rows] = data;
    const width = Math.max(headers.length, ...rows.map((r) => r.length));
    const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? '');
    return { name, headers: pad(headers).map((h, i) => String(h || `Sütun ${i + 1}`)), rows: rows.map(pad) };
  }).filter((s) => s.rows.length > 0);
}

// Temizlenmiş tabloyu satır dizisine çevirir. Değişmeyen hücrelerde orijinal değer (sayı, tarih) korunur.
function toRows(sheet, result, withGroup) {
  const headers = withGroup ? [...sheet.headers, 'Eslesme_Grubu'] : sheet.headers;
  const groupNo = new Map(result.groups.map((g, i) => g.map((r) => [r, i + 1])).flat());
  const rows = result.cells.map((row, r) => {
    const values = row.map((cell, c) => (cell.status === 'same' ? sheet.rows[r][c] : cell.value));
    return withGroup ? [...values, groupNo.get(r) ?? ''] : values;
  });
  return [headers, ...rows];
}

const baseName = (fileName) => fileName.replace(/\.[^.]+$/, '');

export function downloadXlsx(fileName, sheets, results, withGroup) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet, i) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows(sheet, results[i], withGroup)), sheet.name.slice(0, 31));
  });
  XLSX.writeFile(wb, `${baseName(fileName)}_temiz.xlsx`);
}

export function downloadCsv(fileName, sheet, result, withGroup, multiSheet) {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(toRows(sheet, result, withGroup)));
  // Başa BOM eklenir ki Excel Türkçe karakterleri doğru göstersin
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName(fileName)}${multiSheet ? `_${sheet.name}` : ''}_temiz.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
