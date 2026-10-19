// Doğruluk ölçümü. Çalıştırma: npm test   (hatalı hücreleri görmek için: npm test -- --hatalar)
// 1) Verilen örnek dosya (Ham_Veri.xlsx) + elle doğrulanmış doğru gruplar
// 2) Doğru cevabı bilinen sentetik veriler (farklı kirlilik seviyeleri, dosya biçimleri ve zor durumlar)
// Her test iki kez ölçülür:
//   - "Soru cevapsız": kullanıcı hiçbir soruya cevap vermez (şüpheli durumlar birleştirilmez)
//   - "Sorular cevaplı": sanal bir kullanıcı soruları doğru cevaplar (gerçek kullanımı taklit eder)
// Sonuçlar ekrana ve tests/SONUCLAR.md dosyasına yazılır.

import * as fs from 'fs';
import * as XLSX from 'xlsx/xlsx.mjs';
import { processTable, KEEP_OWN } from '../src/engine/pipeline.js';
import { fold } from '../src/engine/text.js';
import { findHeaderRow } from '../src/engine/table.js';
import { makeDataset, extendDataset } from './generate.js';
import { readFile } from '../src/io.js';

XLSX.set_fs(fs);
const dir = new URL('.', import.meta.url).pathname;

// Çift bazında başarı: algoritmanın "aynı kişi" dediği satır çiftleri ile gerçek çiftler
function pairMetrics(groupOf, personOf) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < personOf.length; i++) {
    for (let j = i + 1; j < personOf.length; j++) {
      const pred = groupOf[i] === groupOf[j];
      const real = personOf[i] === personOf[j];
      if (pred && real) tp++;
      else if (pred) fp++;
      else if (real) fn++;
    }
  }
  return { tp, fp, fn };
}

// Hücre bazında başarı: temizlenmiş değer beklenen değerle birebir aynı mı? (cols: kontrol edilen sütunlar)
function cellMetrics(rows, cells, expected, cols) {
  let before = 0, after = 0, total = 0;
  const wrong = [];
  rows.forEach((row, r) => cols.forEach((c) => {
    const exp = expected[r][c] ?? '';
    total++;
    if (String(row[c] ?? '') === exp) before++;
    if (cells[r][c].value === exp) after++;
    else wrong.push(`${cells[r][c].original || '(boş)'} -> ${cells[r][c].value || '(boş)'} [beklenen: ${exp}]`);
  }));
  return { before, after, total, wrong };
}

// Sanal kullanıcı: gerçeği bilir, sistemin sorularını doğru cevaplar. Soru kalmayana kadar devam eder.
function answerQuestions(headers, rows, personOf, expected) {
  const d = { pairs: {}, names: {}, choices: {}, rules: {}, cells: {} };
  let res = processTable(headers, rows, d);
  let answered = 0;
  for (let round = 0; round < 80 && res.questions.length; round++) {
    const q = res.questions[0]; // kullanıcı soruları sırayla cevaplar
    const samePerson = (list) => list.every((r) => personOf[r] === personOf[list[0]]);
    if (q.kind === 'pair') d.pairs[q.key] = personOf[q.a] === personOf[q.b];
    if (q.kind === 'name') d.names[q.key] = samePerson(q.people.flatMap((p) => p.rows));
    if (q.kind === 'conflict') d.choices[q.id] = samePerson(q.rows) ? expected[q.rows[0]][q.col] : KEEP_OWN;
    if (q.kind === 'cell') d.rules[q.col] = { ...d.rules[q.col], [fold(q.original)]: expected[q.row][q.col] };
    answered++;
    res = processTable(headers, rows, d);
  }
  return { res, answered };
}

function measure(headers, rows, personOf, expected, cols) {
  const plain = processTable(headers, rows);
  const { res: asked, answered } = answerQuestions(headers, rows, personOf, expected);
  return {
    rows: rows.length,
    questions: plain.questions.length,
    answered,
    plain: { ...pairMetrics(plain.groupOf, personOf), ...cellMetrics(rows, plain.cells, expected, cols) },
    asked: { ...pairMetrics(asked.groupOf, personOf), ...cellMetrics(rows, asked.cells, expected, cols) },
  };
}

function evalSample() {
  const wb = XLSX.readFile(`${dir}data/Ham_Veri.xlsx`);
  const [headers, ...rows] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const gold = JSON.parse(fs.readFileSync(`${dir}data/Ham_Veri_dogru_gruplar.json`, 'utf8')).gruplar;
  const personOfId = {};
  gold.forEach((g, gi) => g.forEach((id) => { personOfId[id] = gi; }));
  const personOf = rows.map((r) => personOfId[r[0]]);
  // Beklenen değer: grubun "Web Başvurusu" satırı (ID ve Kaynak sütunları kontrol edilmez)
  const webRow = {};
  rows.forEach((r) => { if (r[8] === 'Web Başvurusu') webRow[personOfId[r[0]]] = r; });
  const expected = rows.map((r) => webRow[personOfId[r[0]]].map(String));
  return { name: 'Ham_Veri.xlsx (verilen dosya)', ...measure(headers, rows, personOf, expected, [1, 2, 3, 4, 5, 6, 7]) };
}

function evalSynthetic(name, options, variant = {}, { dropIds = false } = {}) {
  const total = { name, rows: 0, questions: 0, answered: 0, plain: {}, asked: {} };
  const add = (into, m) => {
    for (const k of ['tp', 'fp', 'fn', 'before', 'after', 'total']) into[k] = (into[k] || 0) + m[k];
    into.wrong = [...(into.wrong || []), ...m.wrong];
  };
  for (let seed = 1; seed <= 5; seed++) {
    let { headers, rows, truth } = extendDataset(makeDataset(seed * 7919, options), seed * 31, variant);
    let expected = truth.map((t) => t.clean);
    if (dropIds) { // e-posta ve telefon sütunları yok: sadece isim/kurum/adres ile eşleştirme
      const keep = headers.flatMap((h, c) => (['Eposta', 'Telefon'].includes(h) ? [] : [c]));
      headers = keep.map((c) => headers[c]);
      rows = rows.map((r) => keep.map((c) => r[c]));
      expected = expected.map((r) => keep.map((c) => r[c]));
    }
    const m = measure(headers, rows, truth.map((t) => t.person), expected, headers.map((_, c) => c));
    total.rows += m.rows;
    total.questions += m.questions;
    total.answered += m.answered;
    add(total.plain, m.plain);
    add(total.asked, m.asked);
  }
  return total;
}

// Başlık satırı ilk satırda olmayan dosyalar (üstte başlık / açıklama satırları)
function evalHeaderDetection() {
  const cases = [
    [['Ad Soyad', 'Kurum'], ['Ahmet', 'Uludağ']],
    [['2024 Katılımcı Listesi'], [], ['Ad Soyad', 'Kurum', 'Bölüm'], ['Ahmet', 'Uludağ', 'Tarih']],
    [['Rapor', '', ''], ['Hazırlayan: X', '', ''], ['Sıra', 'İsim', 'Okul'], [1, 'Ali', 'ODTÜ'], [2, 'Can', 'İTÜ']],
  ];
  const expectedRows = [0, 2, 2];
  return cases.filter((c, i) => findHeaderRow(c) === expectedRows[i]).length === cases.length;
}

// Gerçek hayattan zor bir CSV: Windows-1254 kodlama, ";" ayraç, üstte başlık satırı, ayrı Ad/Soyad,
// kısaltmalar, e-posta alan adı hataları, farklı tarih biçimleri
async function evalCsvFixture() {
  const path = `${dir}data/Windows1254_noktali_virgul.csv`;
  const [sheet] = await readFile(new File([fs.readFileSync(path)], 'test.csv'));
  const res = processTable(sheet.headers, sheet.rows);
  const expected = [
    'Ahmet|Yılmaz|Orta Doğu Teknik Üniversitesi|Arş. Gör.|Erkek|ahmet.yilmaz@gmail.com|05.03.1998',
    'Ahmet|Yılmaz|Orta Doğu Teknik Üniversitesi|Arş. Gör.|Erkek|ahmet.yilmaz@gmail.com|05.03.1998',
    'Şule|Öztürk|Hacettepe Üniversitesi|Prof. Dr.|Kadın|sule.ozturk@hotmail.com|12.11.1975',
    'Şule|Öztürk|Hacettepe Üniversitesi|Prof. Dr.|Kadın|sule.ozturk@hotmail.com|12.11.1975',
    'Mehmet|Kaya|Uludağ Üniversitesi Tıp Fakültesi|Öğr. Gör.|Erkek|mkaya@outlook.com|',
  ];
  const got = res.cells.map((row) => row.map((c) => c.value).join('|'));
  return got.filter((g, i) => g === expected[i]).length + ' / ' + expected.length + ' satır doğru';
}

const results = [
  evalSample(),
  evalSynthetic('Sentetik - hafif kirlilik', { level: 0 }),
  evalSynthetic('Sentetik - orta kirlilik', { level: 1 }),
  evalSynthetic('Sentetik - ağır kirlilik', { level: 2 }),
  evalSynthetic('Sentetik - çok sayıda aynı isimli farklı kişi', { level: 1, twins: 0.4 }),
  evalSynthetic('Sentetik - %40 sözlükte olmayan isim', { level: 1, unknownNames: 0.4 }),
  evalSynthetic('Sentetik - telefon/e-posta sütunu yok', { level: 1 }, {}, { dropIds: true }),
  evalSynthetic('Sentetik - Ad ve Soyad ayrı sütunlarda', { level: 1 }, { splitName: true }),
  evalSynthetic('Sentetik - ek sütunlar (unvan, cinsiyet, serbest metin)', { level: 1 }, { extraCols: true }),
  evalSynthetic('Sentetik - gmail/hotmail adresleri + alan adı hataları', { level: 1 }, { emailDomains: true }),
  evalSynthetic('Sentetik - hepsi bir arada, ağır kirlilik', { level: 2, twins: 0.3 }, { splitName: true, extraCols: true, emailDomains: true }),
];

const pct = (a, b) => (b ? `%${((100 * a) / b).toFixed(1)}` : '-');
const lines = [
  '| Test | Satır | Yanlış birleştirme | Bulunan eşleşme | Hücre doğruluğu: önce → sistem | Soru | Sorular cevaplanınca: hücre doğruluğu / bulunan eşleşme |',
  '|---|---|---|---|---|---|---|',
];
for (const r of results) {
  const p = r.plain;
  const a = r.asked;
  lines.push(`| ${r.name} | ${r.rows} | ${p.fp} (kesinlik ${pct(p.tp, p.tp + p.fp)}) | ${pct(p.tp, p.tp + p.fn)} | ${pct(p.before, p.total)} → **${pct(p.after, p.total)}** | ${r.questions} | **${pct(a.after, a.total)}** / ${pct(a.tp, a.tp + a.fn)} (${a.fp} yanlış) |`);
}
const headerOk = evalHeaderDetection();
const csvOk = await evalCsvFixture();
const table = `${lines.join('\n')}\n\n- Başlık satırı tespiti (üstte açıklama satırları olan dosyalar): ${headerOk ? 'tüm örnekler doğru' : 'HATALI'}\n- Windows-1254 kodlu, ";" ayraçlı, başlığı 3. satırda, Ad/Soyad ayrı CSV (\`tests/data/Windows1254_noktali_virgul.csv\`): ${csvOk}`;
console.log(table);

if (process.argv.includes('--hatalar')) {
  for (const r of results) {
    console.log(`\n### ${r.name}: ${r.plain.wrong.length} hatalı hücre (sorular cevaplanınca ${r.asked.wrong.length})`);
    r.plain.wrong.slice(0, 40).forEach((w) => console.log('  ', w));
  }
}

fs.writeFileSync(`${dir}SONUCLAR.md`, `# Test Sonuçları

Komut: \`npm test\` (sentetik testler 5 farklı tohumla üretilir, toplam sonuç verilir).

- **Yanlış birleştirme:** farklı kişilere ait olduğu hâlde "aynı kişi" denen satır çifti sayısı (en zararlı hata).
- **Bulunan eşleşme:** gerçekte aynı kişiye ait satır çiftlerinin ne kadarının bulunduğu.
- **Hücre doğruluğu:** her hücrenin beklenen temiz değerle birebir aynı olma oranı.
- **Soru:** sistemin kullanıcıya sorduğu soru sayısı (ilk açılışta).
- **Sorular cevaplanınca:** sanal bir kullanıcı tüm soruları doğru cevapladıktan sonraki sonuç.

${table}
`);
