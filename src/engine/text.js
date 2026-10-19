// Türkçe metin yardımcıları: harf dönüşümü, karşılaştırma anahtarı, benzerlik.

export const trLower = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');
export const trUpper = (s) => String(s ?? '').toLocaleUpperCase('tr-TR');

// Boşlukları sadeleştirir: baştaki/sondaki boşluklar silinir, çoklu boşluk teke iner.
export const squeeze = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const isEmpty = (v) => v === null || v === undefined || squeeze(v) === '';

// "ahmet YILMAZ" -> "Ahmet Yılmaz"
export function titleCase(s) {
  return squeeze(s)
    .split(' ')
    .map((w) => (w ? trUpper(w[0]) + trLower(w.slice(1)) : w))
    .join(' ');
}

// Karşılaştırma anahtarı: küçük harf + Türkçe karakterler ASCII'ye + noktalama yok.
// "Uludağ ÜNİV." ve "uludag univ" aynı anahtarı üretir.
const FOLD_MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export function fold(s) {
  return trLower(s)
    .replace(/[çğıöşüâîû]/g, (c) => FOLD_MAP[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // kalan aksanlar (i̇ gibi)
    .replace(/[^a-z0-9@]+/g, ' ')
    .trim();
}

export const hasTurkishChars = (s) => /[çğıöşüÇĞİÖŞÜ]/.test(String(s ?? ''));

// Damerau-Levenshtein (OSA): ekleme, silme, değiştirme ve yan yana harf takası = 1 işlem.
// "ahmte" -> "ahmet" tek işlemdir.
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// 0..1 arası benzerlik (1 = aynı)
export function similarity(a, b) {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}

// Bir kelimeye kaç harf hatası tolere edilir? Kısa kelimelerde hata payı düşük tutulur,
// yoksa "Can" ile "Cem" gibi farklı isimler karışır.
export function allowedTypos(word) {
  if (word.length <= 3) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

// Bir kelimeyi sözlükteki en yakın kelimeye eşler. Tek ve net bir aday yoksa null döner.
// dict: Map<katlanmış anahtar, doğru yazım>
export function closestWord(word, dict) {
  const key = fold(word);
  if (dict.has(key)) return { value: dict.get(key), exact: true };
  const limit = allowedTypos(key);
  if (limit === 0) return null;
  let best = null;
  let bestDist = Infinity;
  let tie = false;
  for (const [k, v] of dict) {
    if (Math.abs(k.length - key.length) > limit) continue;
    const dist = editDistance(key, k);
    if (dist < bestDist) { best = v; bestDist = dist; tie = false; }
    else if (dist === bestDist && v !== best) tie = true;
  }
  if (best && bestDist <= limit && !tie) return { value: best, exact: false };
  return null;
}
