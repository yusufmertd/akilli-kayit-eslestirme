// Doğruluk ölçümü. Çalıştırma: npm test
// 1) Verilen örnek dosya (Ham_Veri.xlsx) + elle doğrulanmış doğru gruplar
// 2) Doğru cevabı bilinen sentetik veriler (farklı kirlilik seviyeleri ve zor durumlar)
// Sonuçlar ekrana ve tests/SONUCLAR.md dosyasına yazılır.

import * as fs from 'fs';
import * as XLSX from 'xlsx/xlsx.mjs';
import { processTable } from '../src/engine/pipeline.js';
import { makeDataset } from './generate.js';

XLSX.set_fs(fs);
const dir = new URL('.', import.meta.url).pathname;

// Çift bazında başarı: algoritmanın "aynı kişi" dediği satır çiftleri ile gerçek çiftler
function pairMetrics(predGroupOf, truePersonOf) {
  let tp = 0, fp = 0, fn = 0;
  const n = truePersonOf.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pred = predGroupOf[i] === predGroupOf[j];
      const real = truePersonOf[i] === truePersonOf[j];
      if (pred && real) tp++;
      else if (pred) fp++;
      else if (real) fn++;
    }
  }
  return { tp, fp, fn };
}

// Hücre bazında başarı: temizlenmiş değer beklenen değerle birebir aynı mı?
function cellMetrics(rows, cells, expected, cols) {
  let before = 0, after = 0, total = 0;
  const wrong = [];
  rows.forEach((row, r) => cols.forEach((c, k) => {
    const exp = expected[r][k] ?? '';
    total++;
    if (String(row[c] ?? '') === exp) before++;
    if (cells[r][c].value === exp) after++;
    else wrong.push(`${cells[r][c].original || '(boş)'} -> ${cells[r][c].value || '(boş)'} [beklenen: ${exp}]`);
  }));
  return { before, after, total, wrong };
}

const pct = (a, b) => (b ? `%${((100 * a) / b).toFixed(1)}` : '-');

function evalSample() {
  const wb = XLSX.readFile(`${dir}data/Ham_Veri.xlsx`);
  const [headers, ...rows] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const gold = JSON.parse(fs.readFileSync(`${dir}data/Ham_Veri_dogru_gruplar.json`, 'utf8')).gruplar;
  const personOf = {};
  gold.forEach((g, gi) => g.forEach((id) => { personOf[id] = gi; }));
  const ids = rows.map((r) => r[0]);

  const res = processTable(headers, rows);
  const pm = pairMetrics(res.groupOf, ids.map((id) => personOf[id]));

  // Beklenen değer: grubun "Web Başvurusu" satırı (ID ve Kaynak sütunları hariç)
  const cols = [1, 2, 3, 4, 5, 6, 7];
  const webRow = {};
  rows.forEach((r) => { if (r[8] === 'Web Başvurusu') webRow[personOf[r[0]]] = r; });
  const expected = rows.map((r) => cols.map((c) => String(webRow[personOf[r[0]]][c])));
  const cm = cellMetrics(rows, res.cells, expected, cols);
  return { name: 'Ham_Veri.xlsx (verilen dosya)', rows: rows.length, ...pm, ...cm, questions: res.questions.pairs.length + res.questions.cells.length };
}

function evalSynthetic(name, options, { dropIds = false } = {}) {
  const total = { rows: 0, tp: 0, fp: 0, fn: 0, before: 0, after: 0, total: 0, questions: 0, wrong: [] };
  for (let seed = 1; seed <= 5; seed++) {
    let { headers, rows, truth } = makeDataset(seed * 7919, options);
    let cols = [0, 1, 2, 3, 4, 5, 6];
    let expected = truth.map((t) => t.clean);
    if (dropIds) { // e-posta ve telefon sütunları yok: sadece isim/kurum/adres ile eşleştirme
      const keep = [0, 1, 2, 5, 6];
      headers = keep.map((c) => headers[c]);
      rows = rows.map((r) => keep.map((c) => r[c]));
      expected = expected.map((r) => keep.map((c) => r[c]));
      cols = keep.map((_, i) => i);
    }
    const res = processTable(headers, rows);
    const pm = pairMetrics(res.groupOf, truth.map((t) => t.person));
    const cm = cellMetrics(rows, res.cells, expected, cols);
    total.rows += rows.length;
    for (const k of ['tp', 'fp', 'fn', 'before', 'after', 'total']) total[k] += { ...pm, ...cm }[k];
    total.questions += res.questions.pairs.length + res.questions.cells.length;
    total.wrong.push(...cm.wrong);
  }
  return { name, ...total };
}

const results = [
  evalSample(),
  evalSynthetic('Sentetik - hafif kirlilik', { level: 0 }),
  evalSynthetic('Sentetik - orta kirlilik', { level: 1 }),
  evalSynthetic('Sentetik - ağır kirlilik', { level: 2 }),
  evalSynthetic('Sentetik - çok sayıda aynı isimli farklı kişi', { level: 1, twins: 0.4 }),
  evalSynthetic('Sentetik - %40 sözlükte olmayan isim', { level: 1, unknownNames: 0.4 }),
  evalSynthetic('Sentetik - telefon/e-posta sütunu yok', { level: 1 }, { dropIds: true }),
];

const lines = [
  '| Test | Satır | Kesinlik (yanlış birleştirme yok) | Duyarlılık (bulunan eşleşme) | Hücre doğruluğu önce → sonra | Kullanıcıya soru |',
  '|---|---|---|---|---|---|',
];
for (const r of results) {
  lines.push(`| ${r.name} | ${r.rows} | ${pct(r.tp, r.tp + r.fp)} (${r.fp} yanlış) | ${pct(r.tp, r.tp + r.fn)} | ${pct(r.before, r.total)} → **${pct(r.after, r.total)}** | ${r.questions} |`);
}
const table = lines.join('\n');
console.log(table);

if (process.argv.includes('--hatalar')) {
  for (const r of results) {
    console.log(`\n### ${r.name}: ${r.wrong.length} hatalı hücre`);
    r.wrong.slice(0, 40).forEach((w) => console.log('  ', w));
  }
}

fs.writeFileSync(`${dir}SONUCLAR.md`, `# Test Sonuçları\n\nKomut: \`npm test\` (sentetik testler 5 farklı tohumla üretilir, toplam sonuç verilir).\nŞüpheli çiftler bu ölçümde **birleştirilmemiş** sayılır (kullanıcı cevap vermemiş varsayılır).\n\n${table}\n`);
