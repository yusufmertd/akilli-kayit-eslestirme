// Doğru cevabı bilinen sentetik test verisi üretir.
// Önce temiz kişiler oluşturulur, sonra her kişinin 1-3 kopyası gerçek hayattaki gibi bozulur:
// Türkçe karakter kaybı, büyük/küçük harf, harf hataları, kısaltmalar, eksik alanlar, farklı biçimler.

import { UNIVERSITIES, DEPARTMENTS, CITIES, FIRST_NAMES, SURNAMES, parseList, words } from '../src/engine/dictionaries.js';
import { trUpper, trLower, fold } from '../src/engine/text.js';

// Tekrarlanabilir rastgele sayı üreteci (aynı tohum = aynı veri)
export function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// Sözlükte OLMAYAN isimler: sistemin bilmediği isimlerde de çalıştığını görmek için
const UNKNOWN_FIRST = ['Doruk', 'Kuzey', 'Ayaz', 'Eymen', 'Miraç', 'Zümra', 'Lavin', 'Ilgaz', 'Göktuğ', 'Nehir'];
const UNKNOWN_LAST = ['Gökdağ', 'Ilıcak', 'Sarıgül', 'Erkoç', 'Tümerkan', 'Özyiğit', 'Akçalı', 'Çağlayan'];
const STREETS = ['Atatürk', 'Cumhuriyet', 'Gül', 'Lale', 'Bahçe', 'İstiklal', 'Çınar', 'Barış', 'Yıldız', 'Kültür'];
const QUARTERS = ['Yenişehir', 'Bahçelievler', 'Esentepe', 'Çamlık', 'Gündoğdu', 'Merkez', 'Kampüs', 'Bağlar'];
const STREET_TYPES = [['Caddesi', 'Cad.'], ['Sokak', 'Sk.'], ['Bulvarı', 'Blv.']];

const unis = parseList(UNIVERSITIES);
const depts = parseList(DEPARTMENTS);
const cities = words(CITIES);

const asciify = (s) => s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' })[c]);

function typo(word, rand) {
  if (word.length < 4) return word;
  const i = 1 + Math.floor(rand() * (word.length - 2));
  const kind = rand();
  if (kind < 0.33) return word.slice(0, i) + word.slice(i + 1); // harf silme
  if (kind < 0.66) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); // takas
  const letters = 'abcdeghiklmnoprstuyz';
  return word.slice(0, i) + letters[Math.floor(rand() * letters.length)] + word.slice(i + 1); // değiştirme
}

export function makePerson(id, rand, { unknownNames = 0.15 } = {}) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const first = rand() < unknownNames ? pick(UNKNOWN_FIRST) : pick(words(FIRST_NAMES));
  const last = rand() < unknownNames ? pick(UNKNOWN_LAST) : pick(words(SURNAMES));
  const uni = pick(unis);
  const dept = pick(depts);
  const [stType, stShort] = pick(STREET_TYPES);
  const no = 1 + Math.floor(rand() * 120);
  const phone = `05${String(30 + Math.floor(rand() * 69))}${String(1000000 + Math.floor(rand() * 8999999))}`;
  return {
    id,
    name: `${first} ${last}`,
    uni,
    dept,
    email: `${fold(first)}.${fold(last)}.${id}@example.invalid`.replace(/ /g, ''),
    phone: `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7, 9)} ${phone.slice(9)}`,
    quarter: pick(QUARTERS),
    street: pick(STREETS),
    stType,
    stShort,
    no,
    city: pick(cities),
  };
}

// Kişinin temiz (beklenen) satırı
export function cleanRow(p) {
  return [p.name, p.uni.name, p.dept.name, p.email, p.phone,
    `${p.quarter} Mahallesi, ${p.street} ${p.stType} No: ${p.no}`, p.city];
}

// Kişinin bozulmuş bir kopyası. level: 0 = hafif, 1 = orta, 2 = ağır kirlilik
export function dirtyRow(p, rand, level = 1) {
  const chance = (x) => rand() < x * (0.5 + level * 0.5);
  const caseNoise = (s) => (chance(0.25) ? trUpper(s) : chance(0.25) ? trLower(s) : s);

  let name = p.name;
  if (chance(0.5)) name = asciify(name);
  if (chance(0.3)) name = name.split(' ').map((w, i) => (i === 1 || rand() < 0.5 ? typo(w, rand) : w)).join(' ');
  name = caseNoise(name);

  let uni = p.uni.name;
  if (p.uni.abbr.length && chance(0.3)) uni = p.uni.abbr[0];
  else if (chance(0.3)) uni = trUpper(uni.replace('Üniversitesi', 'Üniv.'));
  else if (chance(0.5)) uni = asciify(uni);
  if (chance(0.15)) uni = uni.split(' ').map((w) => (w.length > 5 && rand() < 0.4 ? typo(w, rand) : w)).join(' ');

  let dept = p.dept.name;
  if (p.dept.abbr.length && chance(0.3)) dept = p.dept.abbr[0];
  else if (chance(0.4)) dept = dept.replace('Mühendisliği', 'Müh.');
  if (chance(0.4)) dept = asciify(dept);
  if (chance(0.15)) dept = dept.split(' ').map((w) => (w.length > 5 && rand() < 0.4 ? typo(w, rand) : w)).join(' ');
  dept = caseNoise(dept);
  if (chance(0.1)) dept = '';

  let email = p.email;
  if (chance(0.3)) email = `  ${email.toUpperCase()} `;
  else if (chance(0.2)) { const at = email.indexOf('.'); email = email.slice(0, at - 1) + '.' + email[at - 1] + email.slice(at + 1); }
  if (chance(0.15)) email = '';

  const digits = p.phone.replace(/\D/g, '');
  let phone = [p.phone, digits.slice(1), `+90 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`][Math.floor(rand() * 3)];
  if (chance(0.15)) phone = '';

  let address = rand() < 0.5
    ? `${p.quarter} Mah. ${p.street} ${p.stShort} No ${p.no}`
    : `No.${p.no} - ${p.quarter} Mahallesi / ${p.street} ${p.stType}`;
  if (chance(0.5)) address = asciify(address);

  let city = p.city;
  if (chance(0.3)) city = trUpper(city);
  else if (chance(0.3)) city = asciify(city);

  return [name, uni, dept, email, phone, address, city];
}

export const HEADERS = ['Ad_Soyad', 'Kurum', 'Bolum', 'Eposta', 'Telefon', 'Adres', 'Sehir'];

// Senaryo: persons kişi, her biri 1-3 kopya. Bazı kişiler "ikiz" (aynı isim + aynı üniversite, farklı kişi).
export function makeDataset(seed, { persons = 40, level = 1, twins = 0.15, unknownNames = 0.15 } = {}) {
  const rand = rng(seed);
  const people = [];
  for (let i = 0; i < persons; i++) {
    const p = makePerson(i + 1, rand, { unknownNames });
    // Zor durum: önceki kişiyle aynı isim + aynı kurum, ama farklı kişi
    if (i > 0 && rand() < twins) {
      const prev = people[Math.floor(rand() * people.length)];
      p.name = prev.name;
      p.uni = prev.uni;
      p.email = `${fold(p.name).replace(' ', '.')}.${p.id}@example.invalid`;
    }
    people.push(p);
  }
  const rows = [];
  const truth = []; // her satır için { person, clean }
  for (const p of people) {
    const copies = 1 + Math.floor(rand() * 3);
    for (let c = 0; c < copies; c++) {
      rows.push(c === 0 && rand() < 0.4 ? cleanRow(p) : dirtyRow(p, rand, level));
      truth.push({ person: p.id, clean: cleanRow(p) });
    }
  }
  // Satırları karıştır
  const order = rows.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { headers: HEADERS, rows: order.map((i) => rows[i]), truth: order.map((i) => truth[i]) };
}
