// Hücre temizleyicileri: her sütun türü (kategori) için değeri düzeltir.
// Hangi sütunun hangi türde olduğuna categories.js karar verir.
// Her temizleyici şunu döner: { value, sure, known, note }
//   sure  : algoritma bu düzeltmeden emin mi?
//   known : sonuç sözlükte bulunan resmi bir yazım mı?
//   note  : kullanıcıya gösterilecek kısa açıklama

import {
  squeeze, isEmpty, titleCase, fold, trLower, trUpper, hasTurkishChars, similarity, closestWord, editDistance,
} from './text.js';
import {
  UNIVERSITIES, DEPARTMENTS, CITIES, FIRST_NAMES, SURNAMES, COMMON_WORDS, TITLES, FACULTIES,
  EMAIL_DOMAINS, INSTITUTION_WORDS, DEPARTMENT_WORDS, ADDRESS_WORDS, FACULTY_WORDS, CITY_ALIASES, MONTHS, parseList, words,
} from './dictionaries.js';

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
  const vocab = new Map(); // sözlükteki tüm kelimeler: kelime düzeyinde harf hatası düzeltmek için
  const abbrs = new Map();
  const foldedAbbrs = new Map();
  for (const { name, abbr } of list) {
    names.set(fold(name), name);
    for (const w of fold(name).split(' ')) if (w.length > 3) vocab.set(w, w);
    for (const a of abbr) {
      if (a.length > 5) names.set(fold(a), name); // uzun eş anlamlılar harf hatasıyla da bulunabilsin
      abbrs.set(abbrKey(a), name);
      const k = fold(a).replace(/ /g, '');
      foldedAbbrs.set(k, foldedAbbrs.has(k) && foldedAbbrs.get(k) !== name ? null : name);
    }
  }
  return { names, abbrs, foldedAbbrs, vocab };
}

const UNI = buildLookup(uniList);
const DEPT = buildLookup(deptList);
const DOMAINS = words(EMAIL_DOMAINS);
const CITY = new Map(words(CITIES).map((c) => [fold(c), c]));

// Dosyanın kendisinden öğrenilen sözlükler: Örneğin dosyada bir yerde "Kampüs" yazıyorsa,
// başka yerdeki "Kampus" da "Kampüs" yapılır. Böylece sözlükte olmayan kelimeler de düzelir.
export function buildContext(columns) {
  const wordMap = new Map();
  for (const w of words(COMMON_WORDS)) addToMap(wordMap, w);
  for (const { name } of [...uniList, ...deptList, ...parseList(FACULTIES), ...parseList(TITLES)]) words(name).forEach((w) => addToMap(wordMap, w));
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
// Kısaltmalar (A.Ş., T.C.) ve büyük yazılmış kısa kelimeler (MEF, TED) olduğu gibi korunur.
function fixWords(text, ctx, expansions = {}) {
  const allCaps = text === trUpper(text);
  return squeeze(text)
    .split(' ')
    .map((w) => {
      const key = fold(w).replace(/ /g, '');
      if (expansions[key]) return expansions[key];
      if (ctx.wordMap.has(key)) return ctx.wordMap.get(key);
      if (/\p{L}\.\p{L}/u.test(w) && w.length <= 6) return trUpper(w);
      if (!allCaps && w.length <= 4 && w === trUpper(w)) return w;
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

  // Önce olduğu gibi, sonra her kelimesi sözlükteki en yakın kelimeye düzeltilerek denenir ("Hacetepe Universtesi")
  const rawKey = expandedKey(text, expansions);
  const fixedKey = rawKey.split(' ').map((w) => (table.vocab.has(w) ? w : closestWord(w, table.vocab)?.value || w)).join(' ');
  for (const k of [rawKey, fixedKey]) {
    if (table.names.has(k)) return { value: table.names.get(k), how: 'yazım düzeltildi', sure: true };
    if (extraSuffix && table.names.has(`${k} ${extraSuffix}`)) {
      return { value: table.names.get(`${k} ${extraSuffix}`), how: 'eksik kelime tamamlandı', sure: true };
    }
  }
  const key = fixedKey;

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
  let text = String(raw).replace(/[._]+/g, ' ').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2'); // ahmet.yilmaz, AhmetYılmaz
  const parts = text.split(',');
  if (parts.length === 2 && parts[1].trim()) text = `${parts[1]} ${parts[0]}`; // "YILMAZ, Ahmet" -> "Ahmet YILMAZ"
  const tokens = squeeze(text).split(' ');
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
      if (ctx.builtinNames.has(fold(hit.value))) knownCount += hit.exact ? 1 : 0.5; // tahmini düzeltme yarım puan
      return hit.value;
    })
    .join(' ');
  const note = !sure ? 'isim sözlükte yok' : fuzzy ? 'harf hatası düzeltildi' : '';
  // known: ismin sözlükte bulunan kelimelerinin oranı (0..1), grup içi seçimde kullanılır
  // Sözlükle düzeltilen harf hataları (Abmet Dılmaz -> Ahmet Yılmaz) kesin kabul edilir, kullanıcıya sorulmaz
  return result(value, sure, knownCount / tokens.length, note);
}

export function cleanInstitution(raw, ctx) {
  const hit = lookup(raw, UNI, INSTITUTION_WORDS, 'universitesi');
  if (hit) return result(hit.value, hit.sure, true, hit.how);

  // Üniversite adı + ek bilgi: "Uludag Univ. Tip Fak." -> "Uludağ Üniversitesi Tıp Fakültesi"
  const key = expandedKey(raw, INSTITUTION_WORDS);
  let prefix = '';
  for (const k of UNI.names.keys()) if (key.startsWith(`${k} `) && k.length > prefix.length) prefix = k;
  if (prefix) {
    const restWords = squeeze(raw).split(' ').slice(prefix.split(' ').length);
    const rest = fixWords(restWords.join(' '), ctx, { ...INSTITUTION_WORDS, ...FACULTY_WORDS });
    return result(`${UNI.names.get(prefix)} ${rest}`, true, true, 'yazım düzeltildi');
  }
  return result(fixWords(raw, ctx, INSTITUTION_WORDS), false, false, 'kurum sözlükte yok');
}

// Sözlüğü olan kategori sütunları (unvan, fakülte, cinsiyet, ülke, dil...) için ortak temizleyici.
// has(): değer sözlükte var mı? (sütun türünü içerikten tahmin ederken kullanılır)
export function dictionary(listText, expansions = {}, label = 'değer') {
  const table = buildLookup(parseList(listText));
  return {
    clean(raw, ctx) {
      const hit = lookup(raw, table, expansions);
      if (hit) return result(hit.value, hit.sure, true, hit.how);
      return result(fixWords(raw, ctx, expansions), false, false, `${label} sözlükte yok`);
    },
    has: (v) => Boolean(lookup(String(v), table, expansions)),
  };
}

// İçerikten tür tahmini için: değer bir üniversite / bölüm adı mı?
export const isUniversity = (v) => Boolean(lookup(String(v), UNI, INSTITUTION_WORDS, 'universitesi'));
export const isDepartment = (v) => Boolean(lookup(String(v), DEPT, DEPARTMENT_WORDS));
export const FIRST_NAME_KEYS = new Set(words(FIRST_NAMES).map(fold));
export const CITY_KEYS = new Set(words(CITIES).map(fold));

export function cleanDepartment(raw, ctx) {
  const hit = lookup(raw, DEPT, DEPARTMENT_WORDS);
  if (hit) return result(hit.value, hit.sure, true, hit.how);
  return result(fixWords(raw, ctx, DEPARTMENT_WORDS), false, false, 'bölüm sözlükte yok');
}

export function cleanCity(raw) {
  const alias = CITY_ALIASES[fold(raw).replace(/ /g, '')];
  if (alias) return result(alias, true, true, 'şehir adı tamamlandı');
  const hit = closestWord(squeeze(raw), CITY);
  if (hit) return result(hit.value, true, true);
  return result(titleCase(raw), false, false, 'il adı tanınmadı');
}

// E-posta: biçim hataları ve popüler alan adlarındaki yazım hataları düzeltilir
//   "mailto:Ahmet@Gmail.com", "<ahmet@gmail.com>", "ahmet (at) gmail.com", "ahmet..yilmaz@", "ahmet yilmaz@" ...
//   "@gma.il", "@gmial.com", "@gmail.con", "@gmailcom", "@gmail" -> "@gmail.com"
const domainKey = (d) => d.replace(/[^a-z]/g, '');
function fixDomain(domain) {
  if (!domain || DOMAINS.includes(domain)) return domain;
  const key = domainKey(domain);
  const near = DOMAINS.filter((d) => {
    const k = domainKey(d);
    const base = d.split('.')[0];
    const dist = editDistance(key, k);
    // İlk harfi farklı aynı uzunlukta bir ad başka gerçek bir alan adıdır ("email.com" ≠ "gmail.com")
    const firstLetterSwap = dist === 1 && key.length === k.length && key[0] !== k[0];
    return key === k || key === base // nokta kaymış ya da eksik: "gma.il", "gmailcom", "gmail"
      || (dist <= (k.length > 9 ? 2 : 1) && !firstLetterSwap) // harf hatası: "gmial.com", "gmail.con"
      || (domain.split('.')[0] === base && /^(con|cmo|cm|co|om|vom|xom|comm|coom)$/.test(domain.split('.').slice(1).join('.'))); // ".con"
  });
  if (!near.length) return domain;
  // Birden çok aday varsa en yakını (yandex.con -> yandex.com, yandex.com.tr değil)
  const score = (d) => editDistance(key, domainKey(d));
  const best = Math.min(...near.map(score));
  const top = near.filter((d) => score(d) === best);
  return top.length === 1 ? top[0] : domain;
}

export function cleanEmail(raw) {
  let value = trLower(squeeze(raw))
    .replace(/^mailto:/, '').replace(/[<>"'()[\]]/g, (ch) => (ch === '(' || ch === '[' ? ' (' : ch === ')' || ch === ']' ? ') ' : ''))
    .replace(/\s*\(\s*(at|et)\s*\)\s*/g, '@')
    .replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g').replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u')
    .replace(/[()]/g, '').trim();
  let [local = '', domain = ''] = value.replace(/\s*@+\s*/g, '@').split('@');
  local = local.replace(/\s+/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, ''); // "ahmet yilmaz", "ahmet..yilmaz", "ahmet."
  domain = domain.replace(/\s+/g, '').replace(/,/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
  const fixedDomain = fixDomain(domain);
  value = domain || raw.includes('@') ? `${local}@${fixedDomain}` : local;
  let note = value !== trLower(squeeze(raw)) ? 'biçim düzeltildi' : '';
  if (fixedDomain !== domain) note = 'alan adı düzeltildi';
  const valid = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value);
  return result(value, valid, valid, valid ? note : 'geçersiz e-posta');
}

// E-postayı "gerçek kişi adresi" biçimine getirir: kullanıcı adındaki teknik/sistem ekleri çıkarılır
//   "ece.demirci.ref27@" -> "ece.demirci@", "ali.can+bulten@" -> "ali.can@", "test.zeynep@" -> "zeynep@",
//   "mehmet_demir_2024@" -> "mehmet_demir@". İsme bitişik sayılar (ahmet1990) kişiye aittir, korunur.
const TECH_SEGMENT = /^(ref|id|no|kod|kayit|user|usr|uye|test|tmp|temp|dummy|deneme|sample|ornek|demo|x+)\d*$|^\d+$/;
export function humanizeEmail(email) {
  const at = email.indexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at).replace(/\+.*$/, ''); // "+etiket" eki
  const domain = email.slice(at);
  const sep = (local.match(/[._-]/) || ['.'])[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  const kept = parts.filter((p) => !TECH_SEGMENT.test(p));
  if (!kept.length || !kept.some((p) => /[a-z]{2,}/.test(p))) return `${local}${domain}`;
  return `${kept.join(sep)}${domain}`;
}

// Tüm telefonlar tek biçime: 0555 100 00 01
export function cleanPhone(raw) {
  // Rakam yerine yazılmış harfler: "O555" (O harfi) -> 0555, "l" / "I" -> 1
  const text = /\d{3}/.test(String(raw)) ? String(raw).replace(/[oO]/g, '0').replace(/[lI]/g, '1') : String(raw);
  let d = text.replace(/\D/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
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
  let floor = '';
  let flat = '';
  text = text.replace(/\b(kat|k)\s*[.:]?\s*(\d+)\b/i, (_, __, n) => { floor = n; return ' '; });
  text = text.replace(/\b(daire|d)\s*[.:]?\s*(\d+)\b/i, (_, __, n) => { flat = n; return ' '; });
  text = text.replace(/[,/;|]|\s-\s|^\s*-|-\s*$/g, ' ').replace(/\./g, '. ');
  let value = fixWords(text.replace(/\./g, ''), ctx, ADDRESS_WORDS);
  value = value.replace(/(Mahallesi) (?=\S)/, '$1, ');
  if (number) value = `${value} No: ${number}`;
  if (floor) value = `${value} Kat: ${floor}`;
  if (flat) value = `${value} Daire: ${flat}`;
  return result(squeeze(value), true, false);
}

// Tarihler tek biçime: 01.02.2024 (gün.ay.yıl). Excel'in sayı olarak sakladığı tarihler de çevrilir.
export function cleanDate(raw) {
  const pad = (n) => String(n).padStart(2, '0');
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return result(`${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`, true, true);
  }
  const s = squeeze(raw);
  const fullYear = (y) => (y.length === 2 ? (Number(y) > 30 ? `19${y}` : `20${y}`) : y);
  let m = s.match(/^(\d{4})[-./, ](\d{1,2})[-./, ](\d{1,2})/);
  if (m) return result(`${pad(m[3])}.${pad(m[2])}.${m[1]}`, true, true);
  m = s.match(/^(\d{1,2})\s*[-./,\s]\s*(\d{1,2})\s*[-./,\s]\s*(\d{2,4})$/);
  if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) return result(`${pad(m[1])}.${pad(m[2])}.${fullYear(m[3])}`, true, true);
  // Ay adıyla: "5 Mart 1998", "05 mar 98", "12 Ağustos 2000"
  m = fold(s).match(/^(\d{1,2}) ([a-z]+) (\d{2,4})$/);
  if (m && MONTHS[m[2]] && Number(m[1]) <= 31) return result(`${pad(m[1])}.${pad(MONTHS[m[2]])}.${fullYear(m[3])}`, true, true, 'ay adı sayıya çevrildi');
  return result(s, false, false, 'tarih biçimi tanınmadı');
}

// Sayılar (yaş, not, puan) ve kimlik numaraları değiştirilmez
export const keepAsIs = (raw) => result(String(raw), true, true);

export function cleanText(raw, ctx) {
  // Türkçe karakteri dosyanın başka bir yerinde doğru yazılmış kelimeler düzeltilir (Muhendis -> Mühendis)
  const text = squeeze(raw);
  const fixed = text.split(' ').map((w) => {
    const hit = !hasTurkishChars(w) && /^\p{L}+$/u.test(w) && ctx.wordMap.get(fold(w));
    if (!hit) return w;
    if (w === trUpper(w)) return trUpper(hit);
    if (w === trLower(w)) return trLower(hit);
    return hit;
  }).join(' ');
  return result(fixed, true, false, fixed !== text ? 'Türkçe karakter düzeltildi' : '');
}
