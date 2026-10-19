// Dosya okuma ve indirme. Her şey tarayıcı belleğinde olur: dosya hiçbir sunucuya gönderilmez,
// localStorage / IndexedDB gibi kalıcı bir yere yazılmaz. Sayfa kapanınca veri yok olur.

import * as XLSX from 'xlsx';
import { findHeaderRow } from './engine/table.js';
import { collapseRows } from './engine/pipeline.js';

// CSV metnini çözer: önce UTF-8, olmazsa Türkçe Windows kodlaması (Excel'in kaydettiği eski CSV'ler)
function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1254').decode(buffer);
  }
}

// Excel veya CSV dosyasını sayfalar listesine çevirir: [{ name, headers, rows, skipped }]
export async function readFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = /\.(csv|txt)$/i.test(file.name)
    ? XLSX.read(decodeCsv(buffer), { type: 'string', raw: true }) // raw: tarih ve sayıları kendi başına çevirme (0555..., 12/11/1975)
    : XLSX.read(buffer, { type: 'array' });

  return wb.SheetNames.map((name) => {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false });
    const start = findHeaderRow(data); // üstteki başlık/açıklama satırları atlanır
    const [headers = [], ...rows] = data.slice(start);
    const width = Math.max(headers.length, ...rows.map((r) => r.length));
    const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? '');
    return {
      name,
      headers: pad(headers).map((h, i) => String(h || `Sütun ${i + 1}`)),
      rows: rows.map(pad),
      skipped: start,
    };
  }).filter((s) => s.rows.length > 0);
}

// İndirilecek tablo. Değişmeyen hücrelerde orijinal değer (sayı, tarih) korunur.
//  dedupe   : aynı kişinin tekrar eden kayıtları tek satıra indirilir
//  withGroup: sona eşleşme grubu numarası sütunu eklenir
export function tableFor(sheet, result, { dedupe = false, withGroup = false } = {}) {
  const groupNo = new Map(result.groups.flatMap((g, i) => g.map((r) => [r, i + 1])));
  const body = dedupe
    ? collapseRows(result, sheet.rows)
    : result.cells.map((row, r) => ({ row: r, values: row.map((cell, c) => (cell.status === 'same' ? sheet.rows[r][c] : cell.value)) }));
  const headers = withGroup ? [...sheet.headers, 'Eslesme_Grubu'] : sheet.headers;
  return [headers, ...body.map(({ row, values }) => (withGroup ? [...values, groupNo.get(row) ?? ''] : values))];
}

const baseName = (fileName) => fileName.replace(/\.[^.]+$/, '');

// "Değişiklikler" raporu: hangi hücre neden değişti (Ayarlar'dan açılır)
function changeReport(sheet, result) {
  const rows = [['Sayfa', 'Satır', 'Sütun', 'Eski değer', 'Yeni değer', 'Neden']];
  result.cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.status !== 'same') rows.push([sheet.name, r + 2 + (sheet.skipped || 0), sheet.headers[c], cell.original, cell.value, cell.note || (cell.status === 'filled' ? 'dolduruldu' : 'düzeltildi')]);
  }));
  return rows;
}

export function downloadXlsx(fileName, sheets, results, options) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet, i) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tableFor(sheet, results[i], options[i])), sheet.name.slice(0, 31));
  });
  if (options.some((o) => o.report)) {
    const report = sheets.flatMap((sheet, i) => (options[i].report ? changeReport(sheet, results[i]).slice(i === 0 ? 0 : 1) : []));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(report), 'Degisiklikler');
  }
  XLSX.writeFile(wb, `${baseName(fileName)}_temiz.xlsx`);
}

export function downloadCsv(fileName, sheet, result, options, multiSheet) {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(tableFor(sheet, result, options)), { FS: options.sep || ',' });
  // Başa BOM eklenir ki Excel Türkçe karakterleri doğru göstersin
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName(fileName)}${multiSheet ? `_${sheet.name}` : ''}_temiz.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
