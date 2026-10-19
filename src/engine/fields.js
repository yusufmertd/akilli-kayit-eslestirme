// Sütun türünü tahmin eder ve her hücreyi türüne göre temizler.
// Her temizleyici şunu döner: { value, sure, known, note }
//   sure  : algoritma bu düzeltmeden emin mi?
//   known : sonuç sözlükte bulunan resmi bir yazım mı?
//   note  : kullanıcıya gösterilecek kısa açıklama

import {
  squeeze, isEmpty, titleCase, fold, trLower, trUpper, hasTurkishChars, similarity, closestWord, editDistance,
} from './text.js';
import {
  UNIVERSITIES, DEPARTMENTS, CITIES, FIRST_NAMES, SURNAMES, COMMON_WORDS,
  INSTITUTION_WORDS, DEPARTMENT_WORDS, ADDRESS_WORDS, parseList, words,
} from './dictionaries.js';

// ---------- Sütun türü tespiti ----------

const HEADER_HINTS = [
  ['email', /e_?posta|mail/],
  ['phone', /tel|gsm|cep/],
  ['id', /(^|_)(id|no|kod)$|sira/],
  ['name', /ad_?soyad|ad soyad|isim|adi|^ad$|name|ogrenci|katilimci|kisi/],
  ['institution', /kurum|universite|okul|kurulus|sirket|firma/],
  ['department', /bolum|departman|program|fakulte|birim/],
  ['address', /adres/],
  ['city', /sehir|^il$|il_|city/],
];

export function detectColumnType(header, values) {
  const h = fold(header).replace(/ /g, '_');
  for (const [type, re] of HEADER_HINTS) if (re.test(h)) return type;

  // Başlık bir şey söylemiyorsa içeriğe bak
  const filled = values.filter((v) => !isEmpty(v)).map(String);
  const ratio = (re) => filled.filter((v) => re.test(v)).length / (filled.length || 1);
  if (ratio(/@/) > 0.6) return 'email';
  if (ratio(/^[\d\s()+-]{10,}$/) > 0.6) return 'phone';
  return 'text';
}

// ---------- Sözlükleri hazırlama ----------

// Katlanmış anahtar -> doğru yazım. Aynı anahtar için Türkçe karakterli yazım tercih edilir.
function addToMap(map, value) {
  const key = fold(value);
  const old = map.get(key);
  if (!old || (!hasTurkishChars(old) && hasTurkishChars(value))) map.set(key, value);
}

const uniList = parseList(UNIVERSITIES);
const deptList = parseList(DEPARTMENTS);

// Kısaltmalar iki şekilde aranır: birebir ("ÇÜ") ve Türkçe karakterler katlanmış ("CU").
// Katlanınca iki farklı üniversiteye denk gelen kısaltma (ÇÜ/CÜ -> "cu") belirsiz sayılır.
const abbrKey = (a) => trUpper(a).replace(/[\s.]/g, '');
function buildLookup(list) {
  const names = new Map();
  const abbrs = new Map();
  const foldedAbbrs = new Map();
  for (const { name, abbr } of list) {
    names.set(fold(name), name);
    for (const a of abbr) {
      abbrs.set(abbrKey(a), name);
      const k = fold(a).replace(/ /g, '');
      foldedAbbrs.set(k, foldedAbbrs.has(k) && foldedAbbrs.get(k) !== name ? null : name);
    }
  }
  return { names, abbrs, foldedAbbrs };
}

const UNI = buildLookup(uniList);
const DEPT = buildLookup(deptList);
const CITY = new Map(words(CITIES).map((c) => [fold(c), c]));

// Dosyanın kendisinden öğrenilen sözlükler: Örneğin dosyada bir yerde "Kampüs" yazıyorsa,
// başka yerdeki "Kampus" da "Kampüs" yapılır. Böylece sözlükte olmayan kelimeler de düzelir.
export function buildContext(columns) {
  const wordMap = new Map();
  for (const w of words(COMMON_WORDS)) addToMap(wordMap, w);
  for (const { name } of [...uniList, ...deptList]) words(name).forEach((w) => addToMap(wordMap, w));
  for (const w of words(CITIES)) addToMap(wordMap, w);

  const nameDict = new Map();
  for (const n of [...words(FIRST_NAMES), ...words(SURNAMES)]) addToMap(nameDict, n);
  const builtinNames = new Set(nameDict.keys());

  const nameCounts = new Map();
  for (const { type, values } of columns) {
    for (const v of values) {
      if (isEmpty(v)) continue;
      for (const w of squeeze(v).split(/[\s,/.:-]+/)) {
        if (w.length < 2 || /\d/.test(w)) continue;
        if (hasTurkishChars(w)) addToMap(wordMap, titleCase(w));
        if (type === 'name') {
          const k = fold(w);
          if (!nameCounts.has(k)) nameCounts.set(k, []);
          nameCounts.get(k).push(titleCase(w));
        }
      }
    }
  }
  // Dosyada en az iki kez geçen isimler "bilinen isim" sayılır (sözlükte olmasa bile).
  // Tek geçenler öğrenilmez; yoksa "Çamkak" gibi bir yazım hatası da doğru sanılırdı.
  // Sözlükteki bir isme 1 harf uzaklıktaysa (Neihr ~ Nehir) yine öğrenilmez: muhtemelen tekrar eden bir hatadır.
  const nearBuiltin = (k) => [...builtinNames].some((b) => b.length >= 4 && editDistance(k, b) <= 1);
  // Ama en az iki kez Türkçe harflerle yazılmışsa (Miraç ~ Mira) bilinçli yazılmış gerçek bir isimdir.
  for (const [k, forms] of nameCounts) {
    if (forms.length < 2 || nameDict.has(k)) continue;
    if (!nearBuiltin(k) || forms.filter(hasTurkishChars).length >= 2) forms.forEach((f) => addToMap(nameDict, f));
  }
  return { wordMap, nameDict, builtinNames };
}

// ---------- Yardımcılar ----------

const result = (value, sure, known, note = '') => ({ value, sure, known, note });

// Kelimeleri tek tek Türkçe yazımına çevirir: "Arastirma Sokak" -> "Araştırma Sokak"
function fixWords(text, ctx, expansions = {}) {
  return squeeze(text)
    .split(' ')
    .map((w) => {
      const key = fold(w).replace(/ /g, '');
      if (expansions[key]) return expansions[key];
      if (ctx.wordMap.has(key)) return ctx.wordMap.get(key);
      return titleCase(w);
    })
    .join(' ');
}

// Kısaltmaları açılmış, katlanmış anahtar: "ULUDAĞ ÜNİV." -> "uludag universitesi"
function expandedKey(text, expansions) {
  return fold(text)
    .split(' ')
    .map((w) => (expansions[w] ? fold(expansions[w]) : w))
    .join(' ');
}

// Sözlükte en benzer kaydı bulur (resmi isim listesi için).
function lookup(text, table, expansions, extraSuffix) {
  const abbr = table.abbrs.get(abbrKey(text)) || table.foldedAbbrs.get(fold(text).replace(/ /g, ''));
  if (abbr) return { value: abbr, how: 'kısaltma açıldı', sure: true };

  const key = expandedKey(text, expansions);
  if (table.names.has(key)) return { value: table.names.get(key), how: 'yazım düzeltildi', sure: true };
  if (extraSuffix && table.names.has(`${key} ${extraSuffix}`)) {
    return { value: table.names.get(`${key} ${extraSuffix}`), how: 'eksik kelime tamamlandı', sure: true };
  }

  // Kısaltılmış kelimeler: "turizm isletm" -> "turizm isletmeciligi"
  const parts = key.split(' ');
  const prefixHits = [];
  for (const [k, v] of table.names) {
    const target = k.split(' ');
    if (target.length === parts.length && parts.every((p, i) => target[i].startsWith(p))) prefixHits.push(v);
  }
  if (prefixHits.length === 1) return { value: prefixHits[0], how: 'kısaltma açıldı', sure: true };

  // Yazım hatası: en benzer resmi isim
  let best = null;
  let bestSim = 0;
  let second = 0;
  for (const [k, v] of table.names) {
    const sim = similarity(key, k);
    if (sim > bestSim) { second = bestSim; bestSim = sim; best = v; }
    else if (sim > second) second = sim;
  }
  if (bestSim >= 0.85 && bestSim - second >= 0.05) {
    return { value: best, how: 'yazım hatası düzeltildi', sure: bestSim >= 0.9 };
  }
  return null;
}

// ---------- Alan temizleyiciler ----------

const turkishLetters = (s) => trLower(s).match(/[çğıöşü]/g) || [];
const keepsTurkishLetters = (from, to) => turkishLetters(from).every((ch) => turkishLetters(to).includes(ch));

export function cleanName(raw, ctx) {
  let sure = true;
  let fuzzy = false;
  let knownCount = 0;
  const tokens = squeeze(raw).split(' ');
  const value = tokens
    .map((token) => {
      let hit = closestWord(token, ctx.nameDict);
      // Kullanıcının özellikle yazdığı Türkçe harfi silen düzeltme yapılmaz (Miraç -> Mira olmaz)
      if (hit && !hit.exact && !keepsTurkishLetters(token, hit.value)) hit = null;
      if (!hit) {
        // Sözlükte yok: Türkçe karakterle özenle yazılmışsa (Göktuğ) doğru kabul edilir, yoksa sorulur
        if (!hasTurkishChars(token)) sure = false;
        return titleCase(token);
      }
      if (!hit.exact) fuzzy = true;
      if (ctx.builtinNames.has(fold(hit.value))) knownCount++;
      return hit.value;
    })
    .join(' ');
  const note = !sure ? 'isim sözlükte yok' : fuzzy ? 'harf hatası düzeltildi' : '';
  // Harf hatası düzeltmesi yapılan isimler (ör. Abmet -> Ahmet) kullanıcıya kontrol için gösterilir.
  // known: ismin sözlükte bulunan kelimelerinin oranı (0..1), grup içi seçimde kullanılır
  return result(value, sure && !fuzzy, knownCount / tokens.length, note);
}

export function cleanInstitution(raw, ctx) {
  const hit = lookup(raw, UNI, INSTITUTION_WORDS, 'universitesi');
  if (hit) return result(hit.value, hit.sure, true, hit.how);
  return result(fixWords(raw, ctx, INSTITUTION_WORDS), false, false, 'kurum sözlükte yok');
}

export function cleanDepartment(raw, ctx) {
  const hit = lookup(raw, DEPT, DEPARTMENT_WORDS);
  if (hit) return result(hit.value, hit.sure, true, hit.how);
  return result(fixWords(raw, ctx, DEPARTMENT_WORDS), false, false, 'bölüm sözlükte yok');
}

export function cleanCity(raw) {
  const hit = closestWord(squeeze(raw), CITY);
  if (hit) return result(hit.value, true, true);
  return result(titleCase(raw), false, false, 'il adı tanınmadı');
}

export function cleanEmail(raw) {
  const value = trLower(String(raw).replace(/\s+/g, ''))
    .replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g').replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u');
  const valid = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value);
  return result(value, valid, valid, valid ? '' : 'geçersiz e-posta');
}

// Tüm telefonlar tek biçime: 0555 100 00 01
export function cleanPhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 10) d = `0${d}`;
  if (d.length !== 11 || !d.startsWith('0')) return result(squeeze(raw), false, false, 'telefon biçimi tanınmadı');
  return result(`${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`, true, true);
}

// Adresler tek biçime: "Yeni Mahallesi, Bilim Caddesi No: 8"
export function cleanAddress(raw, ctx) {
  let text = squeeze(raw);
  let number = '';
  text = text.replace(/\bno\s*[.:]?\s*(\d+[a-zA-Z]?)/i, (_, n) => { number = n; return ' '; });
  text = text.replace(/[,/;|]|\s-\s|^\s*-|-\s*$/g, ' ').replace(/\./g, '. ');
  let value = fixWords(text.replace(/\./g, ''), ctx, ADDRESS_WORDS);
  value = value.replace(/(Mahallesi) (?=\S)/, '$1, ');
  if (number) value = `${value} No: ${number}`;
  return result(squeeze(value), true, false);
}

export function cleanText(raw) {
  return result(squeeze(raw), true, false);
}

export const CLEANERS = {
  name: cleanName,
  institution: cleanInstitution,
  department: cleanDepartment,
  city: cleanCity,
  email: cleanEmail,
  phone: cleanPhone,
  address: cleanAddress,
  text: cleanText,
};
