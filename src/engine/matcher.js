// İki kaydı karşılaştırır ve "aynı kişi mi?" sorusuna üç cevaptan birini verir:
//   'sure'   -> kesin eşleşme, otomatik birleştirilir
//   'unsure' -> şüpheli, kullanıcıya sorulur
//   null     -> eşleşme yok
//
// Kural: Benzer isim tek başına yeterli değildir (aynı isimde farklı kişiler olabilir).
// Telefon / e-posta gibi kimlik bilgileri eşleşirse güçlü kanıt, çelişirse güçlü karşı kanıttır.

import { fold, similarity, isEmpty } from './text.js';

// İsim benzerliği; "Yılmaz Ahmet" ile "Ahmet Yılmaz" da yakalanır.
function nameSimilarity(a, b) {
  const fa = fold(a);
  const fb = fold(b);
  const sorted = (s) => s.split(' ').sort().join(' ');
  return Math.max(similarity(fa, fb), similarity(sorted(fa), sorted(fb)));
}

// E-postanın kullanıcı kısmı noktasız: "can.ozdemir.ege@x" -> "canozdemirege"
const emailKey = (e) => fold(String(e).split('@')[0]).replace(/[^a-z0-9]/g, '');
const emailDigits = (e) => emailKey(e).replace(/\D/g, '');

// E-posta benzerliği. İçindeki sayılar farklıysa (ali.can.1 / ali.can.2) farklı kişi kabul edilir.
function emailSimilarity(a, b) {
  if (emailDigits(a) !== emailDigits(b)) return 0;
  return similarity(emailKey(a), emailKey(b));
}

export function compareRecords(a, b) {
  if (isEmpty(a.name) || isEmpty(b.name)) return null;
  const nameSim = nameSimilarity(a.name, b.name);
  if (nameSim < 0.6) return null;

  const reasons = [];
  const both = (f) => !isEmpty(a[f]) && !isEmpty(b[f]);
  const same = (f) => both(f) && fold(a[f]) === fold(b[f]);
  const differs = (f) => both(f) && fold(a[f]) !== fold(b[f]);

  reasons.push(nameSim === 1 ? 'isim aynı' : `isim %${Math.round(nameSim * 100)} benzer`);

  const phoneMatch = same('phone');
  const phoneConflict = differs('phone');
  const emailSim = both('email') ? emailSimilarity(a.email, b.email) : null;
  const emailMatch = emailSim !== null && emailSim >= 0.9;
  const emailConflict = emailSim !== null && emailSim < 0.8;

  if (phoneMatch) reasons.push('telefon aynı');
  if (phoneConflict) reasons.push('telefon farklı');
  if (emailMatch) reasons.push(emailSim === 1 ? 'e-posta aynı' : 'e-posta neredeyse aynı');
  if (emailConflict) reasons.push('e-posta farklı');
  if (same('institution')) reasons.push('kurum aynı');
  if (differs('institution')) reasons.push('kurum farklı');
  if (same('address')) reasons.push('adres aynı');
  if (differs('address')) reasons.push('adres farklı');
  if (same('department')) reasons.push('bölüm aynı');

  const idMatch = phoneMatch || emailMatch;
  const conflict = phoneConflict || emailConflict;

  // 0-100 arası güven puanı (yalnızca kullanıcıya göstermek için)
  let score = nameSim * 40;
  if (phoneMatch) score += 30;
  if (emailMatch) score += 30;
  if (same('institution')) score += 10;
  if (same('address')) score += 15;
  if (same('department')) score += 5;
  if (conflict) score -= 40;
  if (differs('institution')) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let status = null;
  if (idMatch && !conflict) status = nameSim >= 0.75 ? 'sure' : 'unsure';
  else if (idMatch && conflict) status = 'unsure';
  else if (!conflict) {
    // Kimlik bilgisi yoksa isim + kurum + adres birlikte değerlendirilir
    if (nameSim >= 0.9 && same('institution') && same('address')) status = 'sure';
    else if (nameSim >= 0.85 && (same('institution') || same('address')) && !differs('institution') && !differs('address')) status = 'unsure';
  }
  return status ? { status, score, reasons } : null;
}

// Tüm çiftleri karşılaştırır (100-1000 satır için yeterince hızlı).
export function findPairs(records) {
  const pairs = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const r = compareRecords(records[i], records[j]);
      if (r) pairs.push({ a: i, b: j, ...r });
    }
  }
  return pairs;
}

// Birleşim-bul (union-find): eşleşen çiftlerden gruplar oluşturur. A=B ve B=C ise A, B, C aynı gruptur.
export function buildGroups(count, links) {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [a, b] of links) parent[find(a)] = find(b);
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  return [...groups.values()];
}
