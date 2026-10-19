// Ana akış:
// 1) Sütun türlerini bul   2) Her hücreyi temizle   3) Sütundaki benzer değerleri birleştir
// 4) Aynı kişiye ait kayıtları grupla   5) Grup içinde en doğru yazımı seç, boşlukları doldur
// 6) Emin olunamayan durumları kullanıcıya soru olarak çıkar
//
// decisions: kullanıcının cevapları
//   pairs: { "3-17": true | false }        -> şüpheli çift aynı kişi mi?
//   rules: { [sütun]: { [katlanmış değer]: "doğru yazım" } } -> kullanıcının yazdığı düzeltmeler
//   cells: { "satır-sütun": "değer" }      -> boş bir hücreye kullanıcının yazdığı değer
//   types: { [sütun]: "name" | "email" ... } -> kullanıcının seçtiği sütun türü

import { fold, isEmpty, similarity, hasTurkishChars } from './text.js';
import { detectColumnType, buildContext, CLEANERS } from './fields.js';
import { findPairs, buildGroups } from './matcher.js';

const GROUPED_TYPES = ['name', 'institution', 'department', 'city', 'address', 'email', 'phone'];
const CATEGORY_TYPES = ['institution', 'department', 'city', 'text'];

export const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

export function processTable(headers, rows, decisions = {}) {
  const types = headers.map((h, c) => decisions.types?.[c] || detectColumnType(h, rows.map((r) => r[c])));
  const ctx = buildContext(types.map((type, c) => ({ type, values: rows.map((r) => r[c]) })));

  // 2) Hücre temizliği
  const cleaned = rows.map((row) =>
    headers.map((_, c) => {
      const raw = row[c];
      if (isEmpty(raw)) return null;
      const userValue = decisions.rules?.[c]?.[fold(raw)];
      if (userValue !== undefined) return { value: userValue, sure: true, known: true, user: true, note: 'kullanıcı düzeltmesi' };
      if (types[c] === 'id') return { value: String(raw), sure: true, known: true, note: '' };
      return CLEANERS[types[c]](raw, ctx);
    }),
  );

  // 3) Sütun içi birleştirme: sözlükte olmayan bir değer, sütundaki çok benzer bir değere çekilir
  types.forEach((type, c) => {
    if (CATEGORY_TYPES.includes(type)) harmonizeColumn(cleaned.map((r) => r[c]));
  });

  // 4) Kayıt eşleştirme
  const roleIndex = {};
  types.forEach((t, c) => { if (!(t in roleIndex)) roleIndex[t] = c; });
  const records = cleaned.map((r) => {
    const rec = {};
    for (const [role, c] of Object.entries(roleIndex)) rec[role] = r[c]?.value ?? '';
    return rec;
  });

  const pairs = findPairs(records);
  const links = pairs
    .filter((p) => {
      const answer = decisions.pairs?.[pairKey(p.a, p.b)];
      return answer === true || (p.status === 'sure' && answer !== false);
    })
    .map((p) => [p.a, p.b]);
  const groups = buildGroups(rows.length, links);
  const groupOf = new Array(rows.length);
  groups.forEach((g, gi) => g.forEach((r) => { groupOf[r] = gi; }));

  // 5) Grup içinde en iyi yazımı seç
  const final = cleaned.map((r) => r.map((cell) => (cell ? { ...cell } : null)));
  for (const group of groups) {
    if (group.length < 2) continue;
    let chosenName = ''; // isim önce seçilir; e-posta seçiminde isim kullanılır
    for (const type of GROUPED_TYPES) {
      types.forEach((t, col) => {
        if (t !== type) return;
        const best = pickBest(group.map((r) => cleaned[r][col]).filter(Boolean), type, chosenName);
        if (!best) return;
        if (type === 'name' && col === roleIndex.name) chosenName = best.value;
        for (const r of group) {
          const own = cleaned[r][col];
          // E-posta ve telefon: kişiye ait farklı bir değer varsa ezilmez; sadece yazım hataları ve boşluklar düzeltilir
          if (own && type === 'phone' && own.value !== best.value) continue;
          if (own && type === 'email' && !sameEmail(own.value, best.value)) continue;
          final[r][col] = { ...best, note: own ? best.note || 'grup içi oylama' : 'aynı kişinin diğer kaydından dolduruldu' };
        }
      });
    }
  }

  // E-postada kaymış nokta onarımı: isim "Can Özdemir" ise "cano.zdemir.ege" -> "can.ozdemir.ege"
  if (roleIndex.name !== undefined) {
    types.forEach((t, col) => {
      if (t !== 'email') return;
      final.forEach((row) => {
        const cell = row[col];
        const fixed = cell && repairEmailDots(cell.value, row[roleIndex.name]?.value);
        if (fixed && fixed !== cell.value) row[col] = { ...cell, value: fixed, note: 'e-postadaki nokta düzeltildi' };
      });
    });
  }

  // Hücrelerin son durumu
  const cells = rows.map((row, r) =>
    headers.map((_, c) => {
      const original = isEmpty(row[c]) ? '' : String(row[c]);
      const manual = decisions.cells?.[`${r}-${c}`];
      const cell = manual !== undefined ? { value: manual, sure: true, note: 'kullanıcı düzeltmesi' } : final[r][c];
      const value = cell ? cell.value : '';
      let status = 'same';
      if (!original && value) status = 'filled';
      else if (original !== value) status = 'fixed';
      return { original, value, status, unsure: Boolean(cell && !cell.sure), note: cell?.note || '' };
    }),
  );

  // 6) Sorular
  // Aynı iki grup arasında tek soru sorulur; kullanıcı "farklı" dediyse o iki grup için bir daha sorulmaz.
  const groupPair = (p) => pairKey(groupOf[p.a], groupOf[p.b]);
  const rejected = new Set(pairs.filter((p) => decisions.pairs?.[pairKey(p.a, p.b)] === false).map(groupPair));
  const asked = new Map();
  for (const p of pairs) {
    if (p.status !== 'unsure' || groupOf[p.a] === groupOf[p.b] || rejected.has(groupPair(p))) continue;
    const prev = asked.get(groupPair(p));
    if (!prev || p.score > prev.score) asked.set(groupPair(p), { ...p, key: pairKey(p.a, p.b) });
  }
  const pairQuestions = [...asked.values()];

  const cellQuestions = [];
  const seen = new Set();
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell.unsure || !cell.original) return;
    const id = `${c}|${fold(cell.original)}`;
    if (seen.has(id)) return;
    seen.add(id);
    cellQuestions.push({ col: c, row: r, original: cell.original, suggestion: cell.value, note: cell.note });
  }));

  const flat = cells.flat();
  return {
    headers,
    types,
    cells,
    groups: groups.filter((g) => g.length > 1),
    groupOf,
    pairs,
    questions: { pairs: pairQuestions, cells: cellQuestions },
    stats: {
      rows: rows.length,
      fixed: flat.filter((x) => x.status === 'fixed').length,
      filled: flat.filter((x) => x.status === 'filled').length,
      unsure: flat.filter((x) => x.unsure).length,
      groups: groups.filter((g) => g.length > 1).length,
    },
  };
}

// Grup içi en iyi değer. Her aday için puan:
//  - diğer adaylara benzerlik toplamı (çoğunluk + "merkez" yazım: Tuerkan/Tumerkan/Tumrkan -> Tumerkan)
//  - sözlükte varsa, Türkçe karakter içeriyorsa, kullanıcı yazdıysa ek puan
function pickBest(candidates, type, chosenName) {
  if (!candidates.length) return null;
  const nameEmail = fold(chosenName).replace(/ /g, '.');
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    let score = candidates.reduce((sum, o) => sum + similarity(fold(c.value), fold(o.value)), 0);
    score += 1.5 * Number(c.known); // isimlerde 0..1 arası oran, diğerlerinde true/false
    if (c.sure) score += 0.5;
    if (c.user) score += 100;
    if (hasTurkishChars(c.value)) score += 0.5;
    if (type === 'email' && nameEmail && c.value.startsWith(nameEmail)) score += 1;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// Aynı e-postanın farklı yazımları mı? (içindeki sayılar aynı ve harfler çok benzer)
function sameEmail(a, b) {
  const key = (e) => e.split('@')[0].replace(/[^a-z0-9]/g, '');
  const digits = (e) => key(e).replace(/\D/g, '');
  return digits(a) === digits(b) && similarity(key(a), key(b)) >= 0.8;
}

function repairEmailDots(email, name) {
  if (!email || !name || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const parts = fold(name).split(' ');
  const letters = parts.join('');
  if (parts.length < 2 || !local.includes('.')) return null;
  // e-postanın harfleri isimle başlamıyorsa dokunma
  let i = 0;
  let consumed = 0;
  while (i < local.length && consumed < letters.length) {
    if (local[i] === '.' || local[i] === '_') { i++; continue; }
    if (local[i] !== letters[consumed]) return null;
    i++; consumed++;
  }
  if (consumed < letters.length) return null;
  const rest = local.slice(i);
  if (rest && !/^[._-]/.test(rest)) return null; // isimden sonra hemen harf geliyorsa emin değiliz
  return `${parts.join('.')}${rest}@${domain}`;
}

// Sütundaki sözlük dışı değerleri, çok benzer (yazım hatası) daha güvenilir bir değere eşler.
function harmonizeColumn(cells) {
  const forms = new Map(); // katlanmış -> { cell, count }
  for (const cell of cells) {
    if (!cell) continue;
    const k = fold(cell.value);
    const f = forms.get(k);
    if (f) f.count++;
    else forms.set(k, { cell, count: 1 });
  }
  for (const cell of cells) {
    if (!cell || cell.known) continue;
    const k = fold(cell.value);
    const own = forms.get(k);
    let target = null;
    for (const [k2, f] of forms) {
      if (k2 === k || similarity(k, k2) < 0.88) continue;
      const better = f.cell.known || f.count > own.count;
      if (better && (!target || f.count > target.count)) target = f;
    }
    if (target) {
      Object.assign(cell, { value: target.cell.value, known: target.cell.known, sure: target.cell.known, note: 'benzer değerle birleştirildi' });
    } else if (hasTurkishChars(cell.value) || own.count > 1) {
      // sözlükte yok ama dosyada tutarlı geçiyor -> muhtemelen doğru
      cell.sure = cell.sure || own.count > 1;
    }
  }
}

