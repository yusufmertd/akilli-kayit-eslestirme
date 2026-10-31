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
  const headers = withGroup ? [...sheet.headers, 'Eşleşme Grubu'] : sheet.headers;
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

// Excel çıktısı: düzgün biçimli, filtrelenebilir bir Excel tablosu (kalın başlık, sütun genişlikleri, sabit başlık satırı).
// ExcelJS büyük bir kütüphane olduğu için sadece indirme anında yüklenir.
export async function downloadXlsx(fileName, sheets, results, options) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const used = new Set();
  sheets.forEach((sheet, i) => {
    const [headers, ...rows] = tableFor(sheet, results[i], options[i]);
    addTable(wb, sheetName(sheet.name, used), headers, rows.map((row) => row.map(excelValue)));
  });
  if (options.some((o) => o.report)) {
    const report = sheets.flatMap((sheet, i) => (options[i].report ? changeReport(sheet, results[i]).slice(i === 0 ? 0 : 1) : []));
    if (report.length > 1) addTable(wb, sheetName('Değişiklikler', used), report[0], report.slice(1));
  }
  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${baseName(fileName)}_temiz.xlsx`);
}

// Uzun rakam dizileri (TC, telefon, IBAN) metin olarak yazılır; yoksa Excel 1,23E+10 gösterir
function excelValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1e9) return String(v);
  return v;
}

// Excel sayfa adı: en fazla 31 karakter, : \ / ? * [ ] olmadan ve benzersiz
function sheetName(name, used) {
  const base = String(name).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Sayfa';
  let result = base;
  for (let n = 2; used.has(result.toLocaleLowerCase('tr-TR')); n++) result = `${base} ${n}`;
  used.add(result.toLocaleLowerCase('tr-TR'));
  return result;
}

const textWidth = (v) => Math.max(...String(v ?? '').split('\n').map((line) => line.length));

function addTable(wb, name, headers, rows) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }], // başlık satırı kaydırınca hep görünür
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  // Excel tablosunda başlıklar benzersiz ve dolu olmalı
  const seen = new Map();
  const names = headers.map((h, c) => {
    const base = String(h ?? '').trim() || `Sütun ${c + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  ws.addTable({
    name: `Tablo${wb.worksheets.length}`,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true }, // filtre düğmeleri ve sıralamada bozulmayan satır çizgileri
    columns: names.map((n) => ({ name: n, filterButton: true })),
    rows: rows.length ? rows : [names.map(() => '')],
  });

  // Sütun genişliği içeriğe göre; çok uzun metinler hücre içinde alt satıra geçer
  names.forEach((n, c) => {
    const longest = Math.max(textWidth(n) + 3, ...rows.slice(0, 2000).map((r) => textWidth(r[c])));
    const col = ws.getColumn(c + 1);
    col.width = Math.min(Math.max(longest + 2, 8), 60);
    col.alignment = { vertical: 'top', wrapText: longest > 60 };
  });
  // Biçimler hücrelere ayrıca yazılır: LibreOffice ve Google E-Tablolar Excel tablo stillerini göstermez
  const line = { style: 'thin', color: { argb: 'FFD0D7E5' } };
  ws.eachRow((row, r) => {
    for (let c = 1; c <= names.length; c++) {
      const cell = row.getCell(c);
      cell.border = { top: line, left: line, bottom: line, right: line };
      if (r === 1) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5BD3' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    }
  });
  ws.getRow(1).height = 22;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(fileName, sheet, result, options, multiSheet) {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(tableFor(sheet, result, options)), { FS: options.sep || ',' });
  // Başa BOM eklenir ki Excel Türkçe karakterleri doğru göstersin
  saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${baseName(fileName)}${multiSheet ? `_${sheet.name}` : ''}_temiz.csv`);
}
