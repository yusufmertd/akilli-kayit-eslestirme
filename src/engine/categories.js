// Sütun kategorileri: hangi sütun ne tür veri tutuyor?
// Her kategori için:
//   header : başlık ipucu (katlanmış başlıkta aranır: "E-posta Adresi" -> "e_posta_adresi")
//   test   : tek bir değer bu kategoriye uyuyor mu? (başlık tanınmazsa içerikten tahmin için)
//   min    : değerlerin en az ne kadarı uymalı
//   why    : kullanıcıya gösterilen tahmin gerekçesi
//   clean  : hücre temizleyici
//   person : kişiye ait bilgi mi? (aynı kişinin kayıtları arasında birleştirilir, boşluklar doldurulur)
//   harmonize / generic : sütun içinde aynı değerin farklı yazımları tek yazıma indirilsin mi?

import { fold, squeeze, trUpper } from './text.js';
import {
  cleanName, cleanInstitution, cleanDepartment, cleanCity, cleanEmail, cleanPhone, cleanAddress, cleanDate,
  cleanText, keepAsIs, dictionary, isUniversity, isDepartment, FIRST_NAME_KEYS, CITY_KEYS,
} from './fields.js';
import {
  TITLES, FACULTIES, DEGREES, GENDERS, COUNTRIES, LANGUAGES, LANGUAGE_LEVELS, MARITAL, EDU_TYPES, STATUSES,
  EMPLOYMENT, FACULTY_WORDS,
} from './dictionaries.js';

const result = (value, sure, known = sure, note = '') => ({ value, sure, known, note });

// ---------- Sözlüklü kategoriler ----------
const D = {
  title: dictionary(TITLES, {}, 'unvan'),
  faculty: dictionary(FACULTIES, FACULTY_WORDS, 'fakülte'),
  degree: dictionary(DEGREES, {}, 'öğrenim düzeyi'),
  gender: dictionary(GENDERS, {}, 'cinsiyet'),
  country: dictionary(COUNTRIES, {}, 'ülke'),
  language: dictionary(LANGUAGES, {}, 'dil'),
  level: dictionary(LANGUAGE_LEVELS, {}, 'dil seviyesi'),
  marital: dictionary(MARITAL, {}, 'medeni durum'),
  eduType: dictionary(EDU_TYPES, {}, 'öğretim türü'),
  status: dictionary(STATUSES, {}, 'durum'),
  employment: dictionary(EMPLOYMENT, {}, 'çalışma şekli'),
};

// ---------- Biçim temizleyicileri ----------

const digitsOf = (v) => String(v).replace(/\D/g, '');

// Sayıyı okur: "1.250,50", "1,250.50", "1250.5", "3,45" -> sayı
function parseNumber(v) {
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = /,\d{3}$/.test(s) && s.split(',').length > 1 && !/^\d{1,3},\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // 1.250 -> 1250 (binlik ayırıcı)
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const trNumber = (n, decimals) => n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });

// T.C. kimlik numarası: 11 hane + resmi kontrol hanesi kuralı
export function isValidTc(v) {
  const d = digitsOf(v);
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const n = [...d].map(Number);
  const d10 = ((n[0] + n[2] + n[4] + n[6] + n[8]) * 7 - (n[1] + n[3] + n[5] + n[7])) % 10;
  const d11 = n.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((d10 + 10) % 10) === n[9] && d11 === n[10];
}
const cleanTc = (raw) => {
  const d = digitsOf(raw);
  return isValidTc(d) ? result(d, true) : result(squeeze(raw), false, false, 'T.C. kimlik no doğrulanamadı');
};

// IBAN: boşluksuz yazılmış ya da küçük harfli IBAN 4'lü gruplara ayrılır, kontrol hanesi doğrulanır
function validIban(iban) {
  const moved = iban.slice(4) + iban.slice(0, 4);
  const numeric = moved.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  return BigInt(numeric) % 97n === 1n;
}
const cleanIban = (raw) => {
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) || !validIban(s)) return result(squeeze(raw), false, false, 'IBAN doğrulanamadı');
  return result(s.match(/.{1,4}/g).join(' '), true);
};

// Araç plakası: "34abc123" -> "34 ABC 123"
const PLATE = /^(0[1-9]|[1-7]\d|8[01])\s*([A-ZÇĞİÖŞÜ]{1,3})\s*(\d{2,4})$/i;
const cleanPlate = (raw) => {
  const m = squeeze(raw).match(PLATE);
  return m ? result(`${m[1]} ${trUpper(m[2])} ${m[3]}`, true) : result(squeeze(raw), false, false, 'plaka biçimi tanınmadı');
};

const cleanPostal = (raw) => {
  const d = digitsOf(raw).padStart(5, '0');
  const n = Number(d);
  return d.length === 5 && n >= 1000 && n <= 81999 ? result(d, true) : result(squeeze(raw), false, false, 'posta kodu tanınmadı');
};

const cleanUrl = (raw) => {
  let s = squeeze(raw).replace(/\s/g, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  s = s.replace(/^(https?:\/\/)([^/]+)/i, (_, p, host) => `${p.toLowerCase()}${host.toLowerCase()}`).replace(/\/$/, '');
  return result(s, true);
};

// Sosyal medya: "instagram.com/ahmet" veya "ahmet" -> "@ahmet"
const cleanSocial = (raw) => {
  const s = squeeze(raw).replace(/^(https?:\/\/)?(www\.)?[\w-]+\.[a-z]{2,}\//i, '').replace(/\/$/, '').replace(/^@+/, '');
  return result(`@${s.toLowerCase()}`, true);
};

const cleanTime = (raw) => {
  const m = squeeze(raw).match(/^(\d{1,2})[:.](\d{2})/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return result(squeeze(raw), false, false, 'saat biçimi tanınmadı');
  return result(`${m[1].padStart(2, '0')}:${m[2]}`, true);
};

const YES = new Set(['evet', 'e', 'var', 'yes', 'y', 'true', '1', 'x', 'olumlu', 'katildi', 'geldi', 'tamam', 'ok']);
const NO = new Set(['hayir', 'h', 'yok', 'no', 'n', 'false', '0', 'olumsuz', 'katilmadi', 'gelmedi']);
const cleanBoolean = (raw) => {
  const k = fold(raw) || (/[✓✔]/.test(String(raw)) ? 'x' : '');
  if (YES.has(k) || /[✓✔]/.test(String(raw))) return result('Evet', true);
  if (NO.has(k) || /^[-–✗✘]$/.test(squeeze(raw))) return result('Hayır', true);
  return result(squeeze(raw), false, false, 'evet/hayır olarak anlaşılamadı');
};

// Para: "1250 tl", "₺1.250,5", "1,250.50 TL" -> "1.250,50 TL"
const CURRENCIES = [[/₺|\btl\b|\btry\b/i, 'TL'], [/\$|\busd\b/i, 'USD'], [/€|\beur\b/i, 'EUR'], [/£|\bgbp\b/i, 'GBP']];
const cleanMoney = (raw) => {
  const n = parseNumber(raw);
  if (n === null) return result(squeeze(raw), false, false, 'tutar okunamadı');
  const cur = CURRENCIES.find(([re]) => re.test(String(raw)));
  return result(`${trNumber(n, n % 1 ? 2 : 0)}${cur ? ` ${cur[1]}` : ''}`, true);
};

const cleanPercent = (raw) => {
  const n = parseNumber(raw);
  return n === null ? result(squeeze(raw), false, false, 'yüzde okunamadı') : result(`%${trNumber(n, 0)}`, true);
};

// Not ortalaması: "3.456", "3,4" -> "3,46" / "3,40" (4'lük sistem); 100'lük sistem olduğu gibi kalır
const cleanGpa = (raw) => {
  // Ortalamada tek ayırıcı her zaman ondalıktır: "3.456" = 3,456 (binlik değil)
  const n = /^\s*\d+[.,]\d+\s*$/.test(String(raw)) ? Number(String(raw).trim().replace(',', '.')) : parseNumber(raw);
  if (n === null) return result(squeeze(raw), false, false, 'ortalama okunamadı');
  return result(n <= 4 ? n.toFixed(2).replace('.', ',') : trNumber(n, 0), true);
};

// Yıl: "'98" -> 1998, "21" -> 2021
const cleanYear = (raw) => {
  const s = squeeze(raw);
  if (/^\d{4}$/.test(s)) return result(s, true);
  const m = s.match(/^'?(\d{2})$/);
  if (m) return result(`${Number(m[1]) > 35 ? '19' : '20'}${m[1]}`, true, true, 'yıl dört haneye tamamlandı');
  return result(s, /^\d{4}\s*[-/]\s*\d{4}$/.test(s), false, '');
};

// Kan grubu: "a rh+", "0RH-", "AB pozitif" -> "A Rh+", "0 Rh-", "AB Rh+"
const cleanBlood = (raw) => {
  const s = fold(raw).replace(/\s/g, '');
  const m = s.match(/^(ab|a|b|0|o)(rh)?(\+|-|pozitif|negatif|pos|neg)?/);
  const sign = /[-]|negatif|neg/.test(String(raw).toLowerCase()) ? '-' : /\+|pozitif|pos/.test(String(raw).toLowerCase()) ? '+' : '';
  if (!m || !sign) return result(squeeze(raw), false, false, 'kan grubu tanınmadı');
  return result(`${m[1] === 'o' ? '0' : m[1].toUpperCase()} Rh${sign}`, true);
};

// Sınıf: "1", "1.sınıf", "birinci sınıf", "hazırlık" -> "1. Sınıf", "Hazırlık"
const ORDINALS = { birinci: 1, ikinci: 2, ucuncu: 3, dorduncu: 4, besinci: 5, altinci: 6 };
const cleanClass = (raw) => {
  const k = fold(raw);
  if (/hazirlik/.test(k)) return result('Hazırlık', true);
  const n = Number((k.match(/^(\d)/) || [])[1]) || ORDINALS[k.split(' ')[0]];
  if (n >= 1 && n <= 6) return result(`${n}. Sınıf`, true);
  return result(squeeze(raw), false, false, 'sınıf tanınmadı');
};

// Not/açıklama gibi serbest metinler: sadece boşluklar düzeltilir
const cleanNote = (raw) => result(squeeze(raw), true, false);

// ---------- Kategori listesi ----------
// Sıra önemlidir: başlıkta ilk eşleşen kategori kazanır; içerik testleri de bu sırayla denenir.
const isNum = (v) => /^-?\d+([.,]\d+)?$/.test(v);
const C = (id, label, group, hint, rest) => ({ id, label, group, hint, ...rest });

export const CATEGORIES = [
  // --- Kişi bilgileri
  C('name', 'Ad / Soyad', 'Kişi', 'Kişinin adı, soyadı veya ikisi birlikte', {
    header: /ad_?soyad|isim|soyad|soyisim|^ad$|^adi$|name|katilimci|kisi(_|$)|^ogrenci$|(ogrenci|personel|calisan|uye)_?ad/,
    clean: cleanName, person: true }),
  C('gender', 'Cinsiyet', 'Kişi', 'Kadın / Erkek (K, E, Bay, Bayan da tanınır)', {
    header: /cinsiyet|gender|^cins$/, test: (v) => D.gender.has(v), min: 0.8, why: 'değerler K/E, Kadın/Erkek', clean: D.gender.clean, person: true, harmonize: true }),
  C('birthdate', 'Doğum tarihi', 'Kişi', 'Gün.ay.yıl biçimine çevrilir', {
    header: /dogum_?(tarih|gunu)|birth/, clean: cleanDate, person: true }),
  C('birthplace', 'Doğum yeri', 'Kişi', 'Doğduğu il (81 il listesiyle düzeltilir)', {
    header: /dogum_?yeri|memleket|nufusa_?kayitli/, clean: cleanCity, person: true, harmonize: true }),
  C('age', 'Yaş', 'Kişi', 'Sayı; değiştirilmez', { header: /(^|_)yas(i)?(_|$)|(^|_)age(_|$)/, clean: keepAsIs }),
  C('tc', 'T.C. kimlik no', 'Kişi', '11 haneli kimlik numarası; kontrol hanesi doğrulanır', {
    header: /(^|_)tc(_|$)|tckn|kimlik_?no|t_c_/, test: isValidTc, min: 0.6, why: 'değerler geçerli 11 haneli T.C. kimlik numarası', clean: cleanTc, person: true }),
  C('nationality', 'Uyruk', 'Kişi', 'Vatandaşlık (TC, Türk, Turkey -> Türkiye)', {
    header: /uyruk|vatandas|nationality/, clean: D.country.clean, person: true, harmonize: true }),
  C('marital', 'Medeni durum', 'Kişi', 'Evli / Bekar / Boşanmış / Dul', {
    header: /medeni/, test: (v) => D.marital.has(v) && v.length > 1, min: 0.8, why: 'değerler Evli/Bekar', clean: D.marital.clean, person: true, harmonize: true }),
  C('blood', 'Kan grubu', 'Kişi', '"A Rh+" biçimine çevrilir', {
    header: /kan_?grub|^kan$/, test: (v) => /^(ab|a|b|0|o)\s*(rh)?\s*(\+|-|pozitif|negatif)$/i.test(v), min: 0.7, why: 'değerler kan grubu (A Rh+ gibi)', clean: cleanBlood, person: true }),
  C('title', 'Akademik unvan', 'Kişi', 'Prof. Dr., Doç. Dr., Arş. Gör. ... (eş anlamlılar tanınır)', {
    header: /^(akademik_?)?unvan|akademik|kadro|title/, test: (v) => D.title.has(v), min: 0.7, why: 'değerler akademik unvan', clean: D.title.clean, person: true, harmonize: true }),

  // --- İletişim
  C('email', 'E-posta', 'İletişim', 'Küçük harfe çevrilir, boşluklar silinir, gmial.com gibi hatalar düzeltilir', {
    header: /e_?posta|mail/, test: (v) => /^\S+@\S+\.\S+$/.test(v), min: 0.6, why: 'değerlerde @ işareti var', clean: cleanEmail, person: true }),
  C('phone', 'Telefon', 'İletişim', '"0555 100 00 01" biçimine çevrilir', {
    header: /tel|gsm|cep|phone/, test: (v) => /^((\+?90|0)[\s(]*[2-5]|[\s(]*5)\d{2}[\s)]*\d{3}[\s-]*\d{2}[\s-]*\d{2}$/.test(v), min: 0.6, why: 'değerler 05… / +90 ile başlayan telefon numarası', clean: cleanPhone, person: true }),
  C('address', 'Adres', 'İletişim', 'Mah./Cad./Sk. açılır: "Yeni Mahallesi, Bilim Caddesi No: 8"', {
    header: /adres|address/, test: (v) => /\b(mah|mahalle(si)?|mh|cad|cadde(si)?|cd|sk|sok|sokak|bulvar[ıi]?|blv|apt|daire|no\s*[:.]?\s*\d)\b/i.test(fold(v)), min: 0.5, why: 'değerlerde Mahalle / Cadde / Sokak / No geçiyor', clean: cleanAddress, person: true }),
  C('district', 'İlçe / Semt', 'İletişim', 'İlçe adı; sütundaki farklı yazımlar tek yazıma indirilir', {
    header: /ilce|semt|district/, clean: cleanText, person: true, harmonize: true, generic: true }),
  C('city', 'İl / Şehir', 'İletişim', '81 il listesiyle düzeltilir (Eskisehir -> Eskişehir)', {
    header: /sehir|^il$|^il_|_il$|city|vilayet/, test: (v) => CITY_KEYS.has(fold(v)), min: 0.6, why: 'değerler Türkiye il adı', clean: cleanCity, person: true, harmonize: true }),
  C('postal', 'Posta kodu', 'İletişim', '5 haneli posta kodu', { header: /posta_?kod|zip/, clean: cleanPostal, person: true }),
  C('url', 'Web sitesi', 'İletişim', '"https://..." biçimine getirilir', {
    header: /(^|_)web|(^|_)site(si)?(_|$)|(^|_)url|link/, test: (v) => /^(https?:\/\/|www\.)\S+$|^[\w-]+(\.[\w-]+)*\.(com|net|org|edu|gov|tr|io)(\/\S*)?$/i.test(v) && !v.includes('@'), min: 0.6, why: 'değerler web adresi', clean: cleanUrl }),
  C('social', 'Sosyal medya hesabı', 'İletişim', '"@kullaniciadi" biçimine getirilir', {
    header: /instagram|twitter|linkedin|sosyal|kullanici_?adi|username/, test: (v) => /^@[\w.]{2,}$/.test(v), min: 0.6, why: 'değerler @ ile başlayan kullanıcı adı', clean: cleanSocial }),

  // --- Eğitim
  C('studentNo', 'Öğrenci no', 'Eğitim', 'Değiştirilmez', { header: /ogrenci_?(no|num)|okul_?no/, clean: keepAsIs }),
  C('institution', 'Üniversite / Kurum', 'Eğitim', '196 üniversite ve kısaltmaları (ODTÜ, İTÜ...) ile düzeltilir', {
    header: /kurum|universite|(^|_)okul(_|$)/, test: (v) => /üniv|univ|ünv|üni\b|university/i.test(v) || isUniversity(v), min: 0.5, why: 'değerlerde "Üniversitesi" veya bilinen üniversite adı geçiyor', clean: cleanInstitution, person: true, harmonize: true }),
  C('faculty', 'Fakülte / Enstitü', 'Eğitim', 'Fakülte, enstitü, yüksekokul adları', {
    header: /fakulte|enstitu|yuksekokul/, test: (v) => /fak(ü|u)lte|fak\.|enstit(ü|u)|y(ü|u)ksekokul|\bmyo\b/i.test(v) || D.faculty.has(v), min: 0.6, why: 'değerlerde Fakülte / Enstitü geçiyor', clean: D.faculty.clean, person: true, harmonize: true }),
  C('department', 'Bölüm / Program', 'Eğitim', '119 bölüm ve kısaltmaları (Müh., FTR, MBG...) ile düzeltilir', {
    header: /bolum|program|anabilim|major/, test: (v) => /m(ü|u)hendis|m(ü|u)h\.|(ö|o)(ğ|g)retmenli|b(ö|o)l(ü|u)m(ü|u)/i.test(v) || isDepartment(v), min: 0.5, why: 'değerler bölüm adı (Mühendisliği, Öğretmenliği...)', clean: cleanDepartment, person: true, harmonize: true }),
  C('degree', 'Öğrenim düzeyi', 'Eğitim', 'Ön Lisans / Lisans / Yüksek Lisans / Doktora', {
    header: /ogrenim(?!_?tur)|derece|egitim_?(durum|duzey|seviye)|program_?tur|kademe/, test: (v) => D.degree.has(v) && v.length > 2, min: 0.7, why: 'değerler Lisans / Yüksek Lisans / Doktora', clean: D.degree.clean, person: true, harmonize: true }),
  C('eduType', 'Öğretim türü', 'Eğitim', 'Örgün / İkinci Öğretim / Uzaktan / Açıköğretim', {
    header: /(ogretim|ogrenim)_?(tur|sekli)/, test: (v) => D.eduType.has(v), min: 0.7, why: 'değerler Örgün / İkinci Öğretim', clean: D.eduType.clean, person: true, harmonize: true }),
  C('classYear', 'Sınıf', 'Eğitim', '"1. Sınıf", "Hazırlık"', {
    header: /sinif|class/, test: (v) => /s(ı|i)n(ı|i)f|haz(ı|i)rl(ı|i)k/i.test(v), min: 0.5, why: 'değerlerde "sınıf" geçiyor', clean: cleanClass }),
  C('gpa', 'Not ortalaması', 'Eğitim', '4\'lük sistemde "3,45" biçimi', {
    header: /ortalama|gano|agno|gpa|not_?ort/, test: (v) => /^[0-4][.,]\d{1,3}$/.test(v), min: 0.8, why: 'değerler 0-4 arası ondalıklı sayı', clean: cleanGpa }),
  C('gradYear', 'Mezuniyet / giriş yılı', 'Eğitim', 'Dört haneli yıl', { header: /mezuniyet|giris_?yil|kayit_?yil/, clean: cleanYear }),
  C('langLevel', 'Dil seviyesi', 'Eğitim', 'A1–C2 veya Başlangıç / Orta / İleri', {
    header: /dil_?(seviye|duzey)|level/, test: (v) => /^[abc][12]$/i.test(v), min: 0.7, why: 'değerler A1–C2', clean: D.level.clean, harmonize: true }),
  C('language', 'Yabancı dil', 'Eğitim', 'İngilizce, Almanca... (EN, English da tanınır)', {
    header: /yabanci_?dil|(^|_)dil(_|$)|(^|_)diller|language/, test: (v) => D.language.has(v) && v.length > 2, min: 0.7, why: 'değerler dil adı', clean: D.language.clean, harmonize: true }),
  C('highschool', 'Mezun olduğu lise', 'Eğitim', 'Lise adı; farklı yazımlar tek yazıma indirilir', {
    header: /lise|mezun_?olunan/, clean: cleanText, person: true, harmonize: true, generic: true }),
  C('scholarship', 'Burs durumu', 'Eğitim', 'Serbest metin; farklı yazımlar birleştirilir', { header: /burs/, clean: cleanText, harmonize: true, generic: true }),

  // --- İş
  C('company', 'Şirket / Firma', 'İş', 'Şirket adı; A.Ş., Ltd. gibi kısaltmalar korunur', {
    header: /sirket|firma|isyeri|is_?yeri|company|employer|kurulus/, clean: cleanText, harmonize: true, generic: true }),
  C('unit', 'Departman / Birim', 'İş', 'Şirket içi birim adı', { header: /departman|birim|servis|(^|_)unit/, clean: cleanText, harmonize: true, generic: true }),
  C('position', 'Pozisyon / Meslek', 'İş', 'İş unvanı veya meslek', {
    header: /pozisyon|gorev|meslek|is_?unvan|position|job/, clean: cleanText, person: true, harmonize: true, generic: true }),
  C('sector', 'Sektör', 'İş', 'Sektör adı', { header: /sektor|industry/, clean: cleanText, harmonize: true, generic: true }),
  C('employment', 'Çalışma şekli', 'İş', 'Tam / Yarı zamanlı, Stajyer, Uzaktan...', {
    header: /calisma_?sekli|istihdam|employment/, test: (v) => D.employment.has(v), min: 0.7, why: 'değerler Tam Zamanlı / Stajyer', clean: D.employment.clean, harmonize: true }),
  C('salary', 'Maaş', 'İş', '"12.500 TL" biçimi', { header: /maas|gelir|salary/, clean: cleanMoney }),
  C('startDate', 'İşe başlama tarihi', 'İş', 'Gün.ay.yıl', { header: /ise_?(baslama|giris)|baslangic_?tarih|start/, clean: cleanDate }),

  // --- Kayıt / etkinlik
  C('regDate', 'Kayıt / başvuru tarihi', 'Kayıt', 'Gün.ay.yıl', { header: /(kayit|basvuru)_?tarih/, clean: cleanDate }),
  C('source', 'Kayıt kaynağı', 'Kayıt', 'Kaydın geldiği yer (Web, Excel...)', { header: /kayna(k|g)|source|kanal/, clean: cleanText, harmonize: true, generic: true }),
  C('status', 'Durum', 'Kayıt', 'Aktif / Pasif / Onaylandı / Beklemede...', {
    header: /durum|statu|status/, test: (v) => D.status.has(v) && v.length > 2, min: 0.7, why: 'değerler Aktif / Onaylandı / Beklemede', clean: D.status.clean, harmonize: true }),
  C('attendance', 'Katılım (Evet/Hayır)', 'Kayıt', 'Evet / Hayır (var, yok, 1, 0, ✓ da tanınır)', {
    header: /katilim|katildi|geldi_?mi|onay(_|$)|_m(i|u)$|var_?mi/, clean: cleanBoolean }),
  C('fee', 'Ücret / Tutar', 'Kayıt', '"1.250,50 TL" biçimi', { header: /ucret|tutar|fiyat|odeme|bedel|fee|price/, clean: cleanMoney }),
  C('time', 'Saat', 'Kayıt', '"09:30" biçimi', { header: /saat|(^|_)time/, test: (v) => /^\d{1,2}:\d{2}$/.test(v), min: 0.7, why: 'değerler 09:30 gibi saat', clean: cleanTime }),
  C('tag', 'Kategori / Etiket', 'Kayıt', 'Grup, tür, etiket; farklı yazımlar birleştirilir', {
    header: /kategori|etiket|(^|_)tag|(^|_)grup|(^|_)tur(u)?$|(^|_)tip(i)?$|kulup|topluluk/, clean: cleanText, harmonize: true, generic: true }),
  C('score', 'Puan / Skor', 'Kayıt', 'Sayı; değiştirilmez', { header: /puan|skor|score|sinav/, clean: keepAsIs }),
  C('note', 'Not / Açıklama', 'Kayıt', 'Serbest metin; sadece fazla boşluklar silinir', {
    header: /aciklama|yorum|notlar|remark|comment|ozel_?durum|(^|_)not(_|$)/, clean: cleanNote }),

  // --- Genel biçimler (içerikten tanınır)
  C('id', 'Kimlik / No', 'Genel', 'Kayıt numarası, sicil no; değiştirilmez', {
    header: /(^|_)(id|no|kod|numara|numarasi)$|sira|sicil|kimlik/, clean: keepAsIs }),
  C('iban', 'IBAN', 'Genel', '"TR33 0006 1005 ..." biçimi; kontrol hanesi doğrulanır', {
    header: /iban/, test: (v) => /^TR\s?\d{2}[\d\s]{20,}$/i.test(v), min: 0.6, why: 'değerler TR ile başlayan IBAN', clean: cleanIban }),
  C('plate', 'Araç plakası', 'Genel', '"34 ABC 123" biçimi', { header: /plaka/, test: (v) => PLATE.test(v), min: 0.7, why: 'değerler araç plakası', clean: cleanPlate }),
  C('date', 'Tarih (genel)', 'Genel', 'Gün.ay.yıl biçimi', {
    header: /tarih|date/, test: (v) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d{4}-\d{2}-\d{2}/.test(v), min: 0.6, why: 'değerler tarih', clean: cleanDate }),
  C('percent', 'Yüzde', 'Genel', '"%45" biçimi', { header: /yuzde|(^|_)oran|percent/, test: (v) => /^%\s?\d|\d\s?%$/.test(v), min: 0.6, why: 'değerlerde % işareti var', clean: cleanPercent }),
  C('money', 'Para tutarı', 'Genel', '"1.250,50 TL" biçimi', {
    header: /para|money|amount/, test: (v) => /\d/.test(v) && /₺|\btl\b|\btry\b|\$|€|\busd\b|\beur\b/i.test(v), min: 0.6, why: 'değerlerde TL / ₺ / $ / € var', clean: cleanMoney }),
  C('year', 'Yıl', 'Genel', 'Dört haneli yıl', { header: /(^|_)yil(i)?(_|$)|year/, test: (v) => /^(19[5-9]\d|20[0-4]\d)$/.test(v), min: 0.8, why: 'değerler 1950–2049 arası yıl', clean: cleanYear }),
  C('boolean', 'Evet / Hayır', 'Genel', 'Evet / Hayır (var, yok, 1, 0, ✓ da tanınır)', {
    header: null, test: (v) => YES.has(fold(v)) || NO.has(fold(v)), min: 0.9, why: 'değerler evet/hayır gibi', clean: cleanBoolean }),
  C('country', 'Ülke', 'Genel', 'Ülke adı (TR, Turkey -> Türkiye)', {
    header: /ulke|country/, test: (v) => D.country.has(v) && v.length > 2, min: 0.7, why: 'değerler ülke adı', clean: D.country.clean, harmonize: true }),
  C('number', 'Sayı', 'Genel', 'Değiştirilmez', { header: /sayi|adet|miktar|kredi|akts/, test: isNum, min: 0.8, why: 'değerler sayı', clean: keepAsIs }),
  C('text', 'Diğer (serbest metin)', 'Diğer', 'Genel kurallar: fazla boşluk, büyük/küçük harf ve aynı değerin farklı yazımları düzeltilir', {
    header: null, clean: cleanText, harmonize: true, generic: true }),
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const categoryOf = (id) => BY_ID[id] || BY_ID.text;
export const CLEANERS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.clean]));
export const CATEGORY_GROUPS = [...new Set(CATEGORIES.map((c) => c.group))].map((g) => ({ group: g, items: CATEGORIES.filter((c) => c.group === g) }));

// İçerik testleri bu sırayla denenir: önce kesin biçimler (e-posta, telefon, IBAN...), sonra sözlükler, en son isim.
const CONTENT_ORDER = ['email', 'url', 'social', 'iban', 'tc', 'phone', 'plate', 'date', 'time', 'percent', 'money', 'year', 'gpa',
  'boolean', 'blood', 'gender', 'marital', 'classYear', 'eduType', 'degree', 'status', 'employment', 'langLevel', 'language',
  'country', 'title', 'faculty', 'city', 'institution', 'department', 'address', 'number'];

// Sütun türünü tahmin eder: { type, reason }
export function detectColumnType(header, values) {
  const h = fold(header).replace(/ /g, '_');
  // Hız için en fazla 60 dolu değere bakılır (yüzlerce satırlık dosyalarda da anlık)
  const filled = values.filter((v) => squeeze(v) !== '').slice(0, 60).map((v) => squeeze(v));
  const ratio = (test) => filled.filter((v) => test(v)).length / (filled.length || 1);

  // "Not" başlığı: değerler sayıysa puan, değilse açıklama
  if (/^not(u|lar)?$/.test(h) && filled.length && ratio(isNum) > 0.8) return { type: 'score', reason: 'başlık "Not" ve değerler sayı' };
  for (const c of CATEGORIES) {
    if (c.header && c.header.test(h)) return { type: c.id, reason: `başlıkta "${header}" yazıyor` };
  }
  if (!filled.length) return { type: 'text', reason: 'sütun boş' };
  for (const id of CONTENT_ORDER) {
    const c = BY_ID[id];
    const r = ratio(c.test);
    if (r >= c.min) return { type: id, reason: `${c.why} (%${Math.round(r * 100)})` };
  }
  const nameRatio = ratio((v) => /^\S+( \S+){1,2}$/.test(v) && FIRST_NAME_KEYS.has(fold(v.split(' ')[0])));
  if (nameRatio > 0.5) return { type: 'name', reason: `değerler bilinen bir isimle başlıyor (%${Math.round(nameRatio * 100)})` };
  return { type: 'text', reason: 'tanınan bir biçim yok, genel kurallar uygulanır' };
}
