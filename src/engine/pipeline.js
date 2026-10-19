// Ana akış:
// 1) Sütun türlerini bul   2) Her hücreyi temizle   3) Sütundaki aynı/benzer değerleri tek yazıma indir
// 4) Aynı kişiye ait kayıtları grupla (aynı isimli farklı kişiler için kullanıcıya sor)
// 5) Grup içinde en doğru yazımı seç, boşlukları doldur; çelişen değerlerde kullanıcıya "hangisi doğru?" diye sor
// 6) Emin olunamayan tüm durumları soru listesi olarak çıkar
//
// decisions: kullanıcının cevapları (her cevaptan sonra her şey yeniden hesaplanır)
//   pairs:   { "3-17": true | false }              -> şüpheli iki kayıt aynı kişi mi?
//   names:   { "ahmet yilmaz": true | false }       -> aynı isimli kişiler birleştirilsin mi?
//   choices: { "satır|sütun": "değer" | KEEP_OWN }  -> birleşen grupta çelişen alan için doğru değer
//   rules:   { [sütun]: { [katlanmış değer]: "doğru yazım" } } -> kullanıcının yazdığı düzeltmeler
//   cells:   { "satır-sütun": "değer" }             -> tek bir hücreye kullanıcının yazdığı değer
//   types:   { [sütun]: "name" | "email" ... }      -> kullanıcının seçtiği sütun türü
//   mode:    'auto' | 'suspicious' | 'manual'       -> ne kadar soru sorulacak (varsayılan: 'suspicious')
//            auto       : hiç soru yok, tüm kararları algoritma verir
//            suspicious : sadece belirsiz eşleşmeler sorulur (aynı isimli kişiler, şüpheli çiftler)
//            manual     : her eşleşme, her çelişki ve emin olunamayan her yazım sorulur
//   review:  'all' | undefined                      -> manuel modda "kalan eşleşmelerin hepsini onayla" dendi mi?
//   groups:  { "0,11,58": true | false }            -> otomatik bulunan grup onaylandı mı / reddedildi mi?

import { fold, isEmpty, similarity, hasTurkishChars, titleCase, trUpper, trLower } from './text.js';
import { buildContext } from './fields.js';
import { CATEGORIES, CLEANERS, categoryOf, detectColumnType } from './categories.js';
import { findPairs, buildGroups } from './matcher.js';

export const KEEP_OWN = '__her_satir_kendi__';

// Grup içinde birleştirilen sütunlar (kişiye ait bilgiler, categories.js'de "person" işaretli).
// Liste sırası kategori sırasıdır: isim önce gelir, e-posta seçiminde isim kullanılır.
const PERSON_TYPES = CATEGORIES.filter((c) => c.person).map((c) => c.id);
// Bu alanlarda çelişki hiç sorulmaz: her zaman en uzun (en ayrıntılı) değer seçilir
// ("Uludağ Üniversitesi" / "Bursa Uludağ Üniversitesi", "Tıp Fak." / "Tıp Fakültesi")
const LONGEST_TYPES = ['institution', 'faculty', 'department', 'highschool', 'district', 'position'];
// Grup özetinde (kartlarda, sorularda) kişiyi tanıtmak için kullanılan alanlar
const SUMMARY_TYPES = ['institution', 'department', 'city', 'phone', 'email'];

export const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

// Sütun türü tahmini sadece dosyaya bağlıdır: her cevaptan sonra yeniden hesaplanmasın diye bellekte tutulur
const detectionCache = new WeakMap();
function detectAll(headers, rows) {
  const key = headers.join('\u0001');
  const cached = detectionCache.get(rows);
  if (cached?.key !== key) detectionCache.set(rows, { key, value: headers.map((h, c) => detectColumnType(h, rows.map((r) => r[c]))) });
  return detectionCache.get(rows).value;
}

export function processTable(headers, rows, decisions = {}) {
  const mode = decisions.mode || 'suspicious';
  const askMatches = mode !== 'auto'; // eşleşme soruları (aynı isim, şüpheli çift)
  const manual = mode === 'manual'; // her şey sorulur
  const detected = detectAll(headers, rows);
  const types = headers.map((_, c) => decisions.types?.[c] || detected[c].type);
  const typeReasons = headers.map((_, c) => (decisions.types?.[c] ? 'sizin seçiminiz' : detected[c].reason));
  const ctx = buildContext(types.map((type, c) => ({ type, values: rows.map((r) => r[c]) })));
  const colsOf = (type) => types.flatMap((t, c) => (t === type ? [c] : []));
  const nameCols = colsOf('name'); // "Ad" ve "Soyad" ayrı sütun olabilir

  // 2) Hücre temizliği
  const cleaned = rows.map((row) =>
    headers.map((_, c) => {
      const raw = row[c];
      if (isEmpty(raw)) return null;
      const userValue = decisions.rules?.[c]?.[fold(raw)];
      if (userValue !== undefined) return { value: userValue, sure: true, known: true, user: true, note: 'kullanıcı düzeltmesi' };
      return CLEANERS[types[c]](raw, ctx);
    }),
  );

  // 3) Sütun içi tek yazım
  types.forEach((type, c) => {
    const cat = categoryOf(type);
    if (cat.harmonize) harmonizeColumn(cleaned.map((r) => r[c]), Boolean(cat.generic));
  });

  // 4) Kayıt eşleştirme
  const fullName = (cellsOfRow) => nameCols.map((c) => cellsOfRow[c]?.value).filter(Boolean).join(' ');
  const records = cleaned.map((r) => {
    const rec = { name: fullName(r) };
    for (const type of ['email', 'phone', 'tc', 'institution', 'department', 'address', 'city']) {
      const c = colsOf(type)[0];
      rec[type] = c === undefined ? '' : r[c]?.value ?? '';
    }
    return rec;
  });

  const pairs = findPairs(records);
  const answerOf = (p) => decisions.pairs?.[pairKey(p.a, p.b)];
  // Kullanıcının "bunlar aynı kişi değil" dediği gruplar: içlerindeki otomatik bağlar kullanılmaz
  const rejectedRows = new Set(Object.entries(decisions.groups || {}).filter(([, v]) => v === false).flatMap(([k]) => k.split(',').map(Number)));
  const autoBlocked = (p) => rejectedRows.has(p.a) && rejectedRows.has(p.b);
  const links = pairs
    .filter((p) => answerOf(p) === true || (p.status === 'sure' && answerOf(p) !== false && !autoBlocked(p)))
    .map((p) => [p.a, p.b]);
  const userRows = new Set(pairs.filter((p) => answerOf(p) === true).flatMap((p) => [p.a, p.b])); // kullanıcı onaylı bağlar

  // Aynı isimde birden fazla kişi (grup) varsa: kullanıcı "birleştir" dediyse birleştir, cevap yoksa sor
  const byName = new Map();
  for (const g of buildGroups(rows.length, links)) {
    const key = fold(mostCommon(g.map((r) => records[r].name).filter(Boolean)));
    if (!key || g.every((r) => rejectedRows.has(r))) continue; // kullanıcı zaten "ayrı kişiler" dedi
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(g);
  }
  const nameQuestions = [];
  for (const [key, sameName] of byName) {
    if (sameName.length < 2) continue;
    const answer = decisions.names?.[key];
    if (answer === true) {
      for (let i = 1; i < sameName.length; i++) links.push([sameName[0][0], sameName[i][0]]);
      sameName.flat().forEach((r) => userRows.add(r));
    }
    if (answer !== undefined || !askMatches) continue; // otomatik modda aynı isimli kişiler ayrı tutulur
    nameQuestions.push({
      kind: 'name',
      id: `name|${key}`,
      key,
      name: mostCommon(sameName.flat().map((r) => records[r].name)),
      people: sameName.map((g) => ({ rows: g, summary: summarize(g, cleaned, types) })),
    });
  }

  const groups = buildGroups(rows.length, links);
  const groupOf = new Array(rows.length);
  groups.forEach((g, gi) => g.forEach((r) => { groupOf[r] = gi; }));

  // 5) Grup içinde en iyi yazımı seç; çelişki varsa kullanıcının seçimini uygula ya da sor
  const final = cleaned.map((r) => r.map((cell) => (cell ? { ...cell } : null)));
  const conflictQuestions = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    const anchor = group[0];
    let chosenName = '';
    for (const type of PERSON_TYPES) {
      for (const col of colsOf(type)) {
        const cands = group.map((r) => cleaned[r][col]).filter(Boolean);
        if (!cands.length) continue;
        const clusters = clusterVariants(cands, type);
        const choiceId = `${anchor}|${col}`;
        const choice = decisions.choices?.[choiceId];

        // Kurum, fakülte, bölüm...: soru sorulmaz, her zaman en uzun (en ayrıntılı) ad seçilir
        if (LONGEST_TYPES.includes(type) && choice === undefined) {
          const best = longestValue(cands, type, chosenName);
          for (const r of group) {
            const own = cleaned[r][col];
            const note = !own ? 'aynı kişinin diğer kaydından dolduruldu' : clusters.length > 1 ? 'en uzun (en ayrıntılı) ad seçildi' : best.note || 'grup içi oylama';
            final[r][col] = { ...best, sure: true, note };
          }
          continue;
        }

        // E-posta: soru sorulmaz; birden fazla adres varsa kişinin adını taşıyan gerçek adres seçilir
        // ("ahmet.yilmaz@..." tercih edilir, "ref16", "test", çok rakamlı adresler geri planda kalır)
        if (type === 'email' && clusters.length > 1 && choice === undefined) {
          const best = bestEmail(cands, chosenName);
          for (const r of group) final[r][col] = { ...best, sure: true, note: cleaned[r][col] ? 'kişinin gerçek e-postası seçildi' : 'aynı kişinin diğer kaydından dolduruldu' };
          continue;
        }

        // Diğer çelişkiler: manuel modda sorulur, diğer modlarda çoğunluğun değeri seçilir
        if (clusters.length > 1 && choice === undefined && !manual) {
          const best = pickBest(cands, type, chosenName);
          for (const r of group) final[r][col] = { ...best, sure: true, note: cleaned[r][col] ? 'otomatik seçildi (çoğunluk)' : 'aynı kişinin diğer kaydından dolduruldu' };
          continue;
        }

        if (clusters.length > 1 && choice === undefined) {
          // Çelişki: her satır kendi değerinin en iyi yazımını korur, kullanıcıya sorulur
          for (const r of group) {
            const own = cleaned[r][col];
            if (!own) continue;
            const best = pickBest(clusters.find((cl) => cl.includes(own)), type, chosenName);
            final[r][col] = { ...best, sure: false, note: 'aynı kişide farklı değerler var, size soruldu' };
          }
          conflictQuestions.push({
            kind: 'conflict',
            id: choiceId,
            col,
            rows: group,
            name: fullName(cleaned[anchor]),
            options: clusters.map((cl) => ({ value: pickBest(cl, type, chosenName).value, count: cl.length })),
          });
          continue;
        }

        if (choice === KEEP_OWN) continue; // kullanıcı "her satır kendi değerini korusun" dedi
        const best = choice !== undefined
          ? { value: choice, sure: true, known: true, user: true, note: 'kullanıcı seçimi' }
          : pickBest(cands, type, chosenName);
        for (const r of group) {
          const own = cleaned[r][col];
          final[r][col] = { ...best, note: own ? best.note || 'grup içi oylama' : 'aynı kişinin diğer kaydından dolduruldu' };
        }
      }
      if (type === 'name') chosenName = fullName(final[anchor]);
    }
  }

  // E-postada kaymış nokta onarımı: isim "Can Özdemir" ise "cano.zdemir.ege" -> "can.ozdemir.ege"
  for (const col of colsOf('email')) {
    final.forEach((row) => {
      const cell = row[col];
      const fixed = cell && repairEmailDots(cell.value, fullName(row));
      if (fixed && fixed !== cell.value) row[col] = { ...cell, value: fixed, note: 'e-postadaki nokta düzeltildi' };
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
  // Şüpheli çiftler: aynı iki grup için tek soru; "farklı" denen gruplar ve aynı isim sorusunun kapsadıkları tekrar sorulmaz
  const askedNames = new Set(nameQuestions.map((q) => q.key));
  const groupPair = (p) => pairKey(groupOf[p.a], groupOf[p.b]);
  const rejected = new Set(pairs.filter((p) => answerOf(p) === false).map(groupPair));
  const asked = new Map();
  for (const p of pairs) {
    if (!askMatches) break; // otomatik modda şüpheli çiftler birleştirilmez, sorulmaz
    if (p.status !== 'unsure' || groupOf[p.a] === groupOf[p.b] || rejected.has(groupPair(p))) continue;
    const nameA = fold(records[p.a].name);
    if (nameA === fold(records[p.b].name) && (askedNames.has(nameA) || decisions.names?.[nameA] !== undefined)) continue;
    const prev = asked.get(groupPair(p));
    if (!prev || p.score > prev.score) asked.set(groupPair(p), { kind: 'pair', id: `pair|${pairKey(p.a, p.b)}`, ...p, key: pairKey(p.a, p.b) });
  }

  // Otomatik bulunan eşleşmeler: sadece manuel modda her grup için onay sorulur
  const groupQuestions = [];
  if (manual && decisions.review !== 'all') {
    groups.forEach((g, gi) => {
      if (g.length < 2 || g.some((r) => userRows.has(r))) return;
      const key = g.join(',');
      if (decisions.groups?.[key] !== undefined) return;
      const reasons = new Set();
      pairs.filter((p) => groupOf[p.a] === gi && groupOf[p.b] === gi).forEach((p) => p.reasons.forEach((x) => reasons.add(x)));
      groupQuestions.push({
        kind: 'group',
        id: `group|${key}`,
        key,
        rows: g,
        proposed: fullName(final[g[0]]),
        variants: [...new Set(g.map((r) => nameCols.map((c) => String(rows[r][c] ?? '').trim()).filter(Boolean).join(' ')))],
        reasons: tidyReasons([...reasons]),
      });
    });
  }
  const pendingGroups = groupQuestions.length;

  const cellQuestions = [];
  const seen = new Set();
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (!manual) return; // emin olunamayan yazımlar sadece manuel modda sorulur (diğerlerinde öneri uygulanır)
    if (!cell.unsure || !cell.original || cell.note.startsWith('aynı kişide')) return;
    const id = `cell|${c}|${fold(cell.original)}`;
    if (seen.has(id)) return;
    seen.add(id);
    cellQuestions.push({ kind: 'cell', id, col: c, row: r, original: cell.original, suggestion: cell.value, note: cell.note });
  }));

  const flat = cells.flat();
  const multi = groups.filter((g) => g.length > 1);
  return {
    headers,
    types,
    typeReasons,
    cells,
    groups: multi,
    groupOf,
    pairs,
    summaries: multi.map((g) => summarize(g, final, types)),
    // Çelişki soruları önce: kullanıcı "birleştir" deyince hemen ardından "hangisi doğru?" sorulur
    questions: [...groupQuestions, ...conflictQuestions, ...nameQuestions, ...asked.values(), ...cellQuestions],
    pendingGroups, // kullanıcının henüz onaylamadığı otomatik eşleşme sayısı
    stats: {
      rows: rows.length,
      people: groups.length,
      fixed: flat.filter((x) => x.status === 'fixed').length,
      filled: flat.filter((x) => x.status === 'filled').length,
      unsure: flat.filter((x) => x.unsure).length,
      groups: multi.length,
      duplicates: rows.length - groups.length,
    },
  };
}

// Tekrarları tek satıra indirilmiş tablo: her kişi için bir satır (grubun ilk satırı kalır).
// Kişiye ait olmayan sütunlarda (kayıt no, kaynak, tarih...) gruptaki farklı değerler virgülle birleştirilir (R001, R012, R059).
export function collapseRows(result, rawRows) {
  const ownValue = (r, c) => (result.cells[r][c].status === 'same' ? rawRows[r][c] : result.cells[r][c].value);
  const groupOfAnchor = new Map(result.groups.map((g) => [g[0], g]));
  const hidden = new Set(result.groups.flatMap((g) => g.slice(1)));
  return result.cells.flatMap((_, r) => {
    if (hidden.has(r)) return [];
    const group = groupOfAnchor.get(r) || [r];
    const values = result.headers.map((__, c) => {
      if (group.length === 1 || categoryOf(result.types[c]).person) return ownValue(r, c);
      const distinct = [...new Set(group.map((x) => String(ownValue(x, c) ?? '')).filter(Boolean))];
      return distinct.length > 1 ? distinct.join(', ') : ownValue(r, c);
    });
    return [{ row: r, values }];
  });
}

// ---------- Yardımcılar ----------

// Grup gerekçelerini sadeleştirir: "e-posta aynı" varsa "e-posta neredeyse aynı" gösterilmez, isim için tek ifade kalır
function tidyReasons(reasons) {
  const has = (x) => reasons.includes(x);
  return reasons.filter((x) => !(x === 'e-posta neredeyse aynı' && has('e-posta aynı')) && !(x.startsWith('isim %') && has('isim aynı')));
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

// Bir grubu kullanıcıya tanıtan kısa özet: "Uludağ Üniversitesi · Bilgisayar Mühendisliği · 3 kayıt"
function summarize(group, cellsByRow, types) {
  const parts = [];
  for (const type of SUMMARY_TYPES) {
    const c = types.indexOf(type);
    if (c < 0 || parts.length >= 2) continue;
    const v = mostCommon(group.map((r) => cellsByRow[r][c]?.value).filter(Boolean));
    if (v) parts.push(v);
  }
  return [...parts, `${group.length} kayıt`].join(' · ');
}

// Aynı değerin yazım çeşitleri bir arada toplanır; farklı değerler ayrı kümelere düşer.
// ("Ahmet Yılmaz" ~ "Abmet Dılmaz" aynı küme; "Uludağ Üniversitesi" ile "Hacettepe Üniversitesi" ayrı kümeler)
function clusterVariants(cands, type) {
  const same = (a, b) => {
    if (['phone', 'birthdate', 'tc', 'postal'].includes(type)) return a.value === b.value;
    if (type === 'email') return sameEmail(a.value, b.value);
    // Adreste kapı numarası farklıysa (No: 8 / No: 87) aynı adres değildir
    if (type === 'address' && a.value.replace(/\D/g, '') !== b.value.replace(/\D/g, '')) return false;
    return similarity(fold(a.value), fold(b.value)) >= 0.8;
  };
  const clusters = [];
  for (const c of cands) {
    const home = clusters.find((cl) => cl.some((x) => same(x, c)));
    if (home) home.push(c);
    else clusters.push([c]);
  }
  return clusters;
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

// E-postanın "gerçek kişi adresi" olma puanı: adı-soyadı içeriyorsa artı, ref16 / test / çok rakam varsa eksi
function emailQuality(email, name) {
  const local = email.split('@')[0];
  const letters = local.replace(/[^a-z]/g, '');
  const parts = fold(name).split(' ').filter((p) => p.length > 1);
  let q = 0;
  if (parts.length && parts.every((p) => letters.includes(p))) q += 2;
  else if (parts.some((p) => p.length > 2 && letters.includes(p))) q += 1;
  if (/ref\d*|test|dummy|deneme|noreply|\d{2,}/.test(local)) q -= 2;
  return q;
}
function bestEmail(candidates, name) {
  const max = Math.max(...candidates.map((c) => emailQuality(c.value, name)));
  return pickBest(candidates.filter((c) => emailQuality(c.value, name) === max), 'email', name);
}

// En uzun değer; aynı uzunlukta birden fazla aday varsa en iyi yazım seçilir
function longestValue(candidates, type, chosenName) {
  const max = Math.max(...candidates.map((c) => c.value.length));
  return pickBest(candidates.filter((c) => c.value.length === max), type, chosenName);
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

// Bir yazımın "kalitesi": Türkçe karakter içeren, BÜYÜK/küçük karışık (normal) yazım tercih edilir
const writingQuality = (v) => (hasTurkishChars(v) ? 0.5 : 0) + (v !== trUpper(v) && v !== trLower(v) ? 0.3 : 0);

// Sütun içi tek yazım:
//  a) Katlanınca aynı olan yazımlar ("COCA COLA", "coca cola", "Coca Cola") en iyi yazıma indirilir
//  b) Sözlük dışı bir değer, sütundaki çok benzer (%88+) daha güvenilir bir değere çekilir (yazım hatası)
//  c) Serbest metin sütununda çoğunluk normal yazılmışsa TAMAMI BÜYÜK / tamamı küçük değerler düzeltilir
// generic: serbest metin türü (sözlüğü yok) mü?
function harmonizeColumn(cells, generic) {
  const filled = cells.filter(Boolean);
  const forms = new Map(); // katlanmış -> hücreler
  for (const cell of filled) {
    const k = fold(cell.value);
    if (!forms.has(k)) forms.set(k, []);
    forms.get(k).push(cell);
  }

  // a)
  for (const group of forms.values()) {
    const score = (c) => group.filter((x) => x.value === c.value).length + writingQuality(c.value) + (c.known ? 1.5 : 0);
    const best = group.reduce((a, b) => (score(b) > score(a) ? b : a));
    for (const cell of group) {
      if (cell.value !== best.value) {
        Object.assign(cell, { value: best.value, known: best.known, sure: best.sure, note: cell.note || 'sütundaki yazımla eşitlendi' });
      }
    }
  }

  // b) Serbest metin sütunlarında sadece "kategori gibi" (değerleri tekrar eden) sütunlarda yapılır
  const categorical = !generic || forms.size <= filled.length * 0.6;
  if (categorical) {
    for (const [k, group] of forms) {
      if (group[0].known) continue;
      let target = null;
      for (const [k2, other] of forms) {
        if (k2 === k || similarity(k, k2) < 0.88) continue;
        if ((other[0].known || other.length > group.length) && (!target || other.length > target.length)) target = other;
      }
      if (target) {
        const t = target[0];
        group.forEach((cell) => Object.assign(cell, { value: t.value, known: t.known, sure: t.known || target.length > 1, note: 'benzer değerle birleştirildi' }));
      } else if (group.length > 1 || hasTurkishChars(group[0].value)) {
        // sözlükte yok ama dosyada tutarlı geçiyor -> muhtemelen doğru
        group.forEach((cell) => { cell.sure = true; });
      }
    }
  }

  // c)
  if (generic) {
    const lettered = filled.filter((c) => /\p{L}{2}/u.test(c.value) && !/[@\d]/.test(c.value));
    const normal = lettered.filter((c) => c.value !== trUpper(c.value) && c.value !== trLower(c.value));
    if (lettered.length >= 3 && normal.length / lettered.length >= 0.6) {
      for (const c of lettered) {
        if (c.value === trUpper(c.value) || c.value === trLower(c.value)) {
          Object.assign(c, { value: titleCase(c.value), note: 'büyük/küçük harf düzeltildi' });
        }
      }
    }
  }
}
