// Yaygın yazım hataları: her kategoride sık görülen hatalar ve beklenen doğru yazım.
// evaluate.js tarafından çalıştırılır; tek başına: node tests/yazim-hatalari.js
import { CLEANERS } from '../src/engine/categories.js';
import { buildContext } from '../src/engine/fields.js';
import { processTable } from '../src/engine/pipeline.js';

export const TYPO_CASES = [
  // E-posta: alan adı ve biçim hataları
  ['email', 'ahmet.yilmaz@gma.il', 'ahmet.yilmaz@gmail.com'],
  ['email', 'ahmet@gmial.com', 'ahmet@gmail.com'],
  ['email', 'ahmet@gamil.com', 'ahmet@gmail.com'],
  ['email', 'ahmet@gmail.con', 'ahmet@gmail.com'],
  ['email', 'ahmet@gmail.co', 'ahmet@gmail.com'],
  ['email', 'ahmet@gmailcom', 'ahmet@gmail.com'],
  ['email', 'ahmet@gmail', 'ahmet@gmail.com'],
  ['email', 'ahmet@hotmial.com', 'ahmet@hotmail.com'],
  ['email', 'ahmet@outlok.com', 'ahmet@outlook.com'],
  ['email', 'ahmet@yaho.com', 'ahmet@yahoo.com'],
  ['email', 'ahmet@yandex.con', 'ahmet@yandex.com'],
  ['email', 'mailto:Ahmet@Gmail.com', 'ahmet@gmail.com'],
  ['email', '<ahmet@gmail.com>', 'ahmet@gmail.com'],
  ['email', 'ahmet (at) gmail.com', 'ahmet@gmail.com'],
  ['email', 'ahmet[at]gmail.com', 'ahmet@gmail.com'],
  ['email', 'ahmet..yilmaz@gmail.com', 'ahmet.yilmaz@gmail.com'],
  ['email', 'ahmet.yilmaz.@gmail.com', 'ahmet.yilmaz@gmail.com'],
  ['email', 'ahmet yilmaz@gmail.com', 'ahmet.yilmaz@gmail.com'],
  ['email', 'ahmet.yilmaz@uludag.edu,tr', 'ahmet.yilmaz@uludag.edu.tr'],
  ['email', 'AHMET.YILMAZ@GMAIL.COM', 'ahmet.yilmaz@gmail.com'],
  ['email', 'ahmet@email.com', 'ahmet@email.com'], // gerçek bir alan adı: değiştirilmemeli
  // Telefon
  ['phone', 'O555 100 00 01', '0555 100 00 01'],
  ['phone', '0 (555) 100-0001', '0555 100 00 01'],
  ['phone', '+90-555-100-00-01', '0555 100 00 01'],
  ['phone', '90 555 100 00 01', '0555 100 00 01'],
  ['phone', '555.100.00.01', '0555 100 00 01'],
  ['phone', '(0555) 1000001', '0555 100 00 01'],
  // Tarih
  ['date', '5 Mart 1998', '05.03.1998'],
  ['date', '05 mar 98', '05.03.1998'],
  ['date', '5 Ocak 2001', '05.01.2001'],
  ['date', '12 Ağustos 2000', '12.08.2000'],
  ['date', '05,03,1998', '05.03.1998'],
  ['date', '05 03 1998', '05.03.1998'],
  ['date', '1998.03.05', '05.03.1998'],
  // Şehir
  ['city', 'İst.', 'İstanbul'], ['city', 'Ank.', 'Ankara'], ['city', 'Antep', 'Gaziantep'], ['city', 'Urfa', 'Şanlıurfa'],
  ['city', 'Maraş', 'Kahramanmaraş'], ['city', 'K.Maraş', 'Kahramanmaraş'], ['city', 'Afyon', 'Afyonkarahisar'],
  ['city', 'İzmit', 'Kocaeli'], ['city', 'Antakya', 'Hatay'], ['city', 'Adapazarı', 'Sakarya'], ['city', 'İçel', 'Mersin'],
  ['city', 'Ankra', 'Ankara'], ['city', 'ISTANBUL', 'İstanbul'], ['city', 'eskisehir', 'Eskişehir'],
  // Ad Soyad
  ['name', 'ahmet.yilmaz', 'Ahmet Yılmaz'], ['name', 'ahmet_yilmaz', 'Ahmet Yılmaz'], ['name', 'AhmetYılmaz', 'Ahmet Yılmaz'],
  ['name', 'YILMAZ, Ahmet', 'Ahmet Yılmaz'], ['name', '  ahmet   YILMAZ ', 'Ahmet Yılmaz'], ['name', 'Abmet Dılmaz', 'Ahmet Yılmaz'],
  // Üniversite
  ['institution', 'Hacetepe Universtesi', 'Hacettepe Üniversitesi'], ['institution', 'Uludag University', 'Uludağ Üniversitesi'],
  ['institution', 'Ege Ünv', 'Ege Üniversitesi'], ['institution', 'Bogazici Uni', 'Boğaziçi Üniversitesi'],
  ['institution', 'Dokuz Eylul Univ.', 'Dokuz Eylül Üniversitesi'], ['institution', 'odtü', 'Orta Doğu Teknik Üniversitesi'],
  ['institution', 'Marmara Ünıversıtesı', 'Marmara Üniversitesi'],
  // Bölüm
  ['department', 'Bilg. Müh.', 'Bilgisayar Mühendisliği'], ['department', 'Bilgisyar Mühendisliği', 'Bilgisayar Mühendisliği'],
  ['department', 'Makina Müh.', 'Makine Mühendisliği'], ['department', 'Elk-Elektronik Müh.', 'Elektrik-Elektronik Mühendisliği'],
  ['department', 'End. Müh.', 'Endüstri Mühendisliği'], ['department', 'Psikolji', 'Psikoloji'], ['department', 'ISLETME', 'İşletme'],
  // Fakülte
  ['faculty', 'Muh. Fak.', 'Mühendislik Fakültesi'], ['faculty', 'Tip Fk.', 'Tıp Fakültesi'], ['faculty', 'Egitim Fakültsi', 'Eğitim Fakültesi'],
  ['faculty', 'Fen Edebiyat Fak.', 'Fen-Edebiyat Fakültesi'], ['faculty', 'iibf', 'İktisadi ve İdari Bilimler Fakültesi'],
  // Unvan
  ['title', 'Prof.Dr.', 'Prof. Dr.'], ['title', 'Doç.Dr', 'Doç. Dr.'], ['title', 'Arş.Gör.', 'Arş. Gör.'], ['title', 'Yrd.Doç.Dr.', 'Dr. Öğr. Üyesi'],
  // Adres
  ['address', 'Yeni Mh. Bilim Cd. No:8', 'Yeni Mahallesi, Bilim Caddesi No: 8'],
  ['address', 'yeni mah bilim cad no 8 k:2 d:3', 'Yeni Mahallesi, Bilim Caddesi No: 8 Kat: 2 Daire: 3'],
  ['address', 'Merkez Mahallesi Akademi Sokağı No.5', 'Merkez Mahallesi, Akademi Sokağı No: 5'],
];

// E-postayı gerçek kişi biçimine getirme (tablo düzeyinde; aynı kişinin adresi farklı kişilerinkiyle çakışmamalı)
export const HUMAN_EMAIL_CASES = [
  ['ece.demirci.ref27@example.invalid', 'ece.demirci@example.invalid'],
  ['ali.can+bulten@gmail.com', 'ali.can@gmail.com'],
  ['test.zeynep.kaya@gmail.com', 'zeynep.kaya@gmail.com'],
  ['mehmet_demir_2024@hotmail.com', 'mehmet_demir@hotmail.com'],
  ['ahmet1990@gmail.com', 'ahmet1990@gmail.com'], // isme bitişik sayı kişiye aittir, korunur
];

export function runTypoCases() {
  const ctx = buildContext([]);
  const wrong = TYPO_CASES.filter(([t, input, exp]) => CLEANERS[t](input, ctx).value !== exp)
    .map(([t, input, exp]) => `${t}: "${input}" -> "${CLEANERS[t](input, ctx).value}" (beklenen "${exp}")`);
  // İnsan biçimi e-posta: farklı kişilerin aynı adrese düşmemesi de kontrol edilir
  const rows = HUMAN_EMAIL_CASES.map(([e], i) => [`Kişi${i} Soyad${i}`, e]);
  rows.push(['Veli Ak', 'veli.ak.1@gmail.com'], ['Veli Ak', 'veli.ak.2@gmail.com']); // iki farklı Veli Ak: adresleri çakışmamalı
  const res = processTable(['Ad Soyad', 'E-posta'], rows, { mode: 'auto', format: { humanEmail: true } });
  HUMAN_EMAIL_CASES.forEach(([input, exp], i) => {
    if (res.cells[i][1].value !== exp) wrong.push(`insan biçimi e-posta: "${input}" -> "${res.cells[i][1].value}" (beklenen "${exp}")`);
  });
  const twins = [res.cells.at(-2)[1].value, res.cells.at(-1)[1].value];
  if (twins[0] === twins[1]) wrong.push(`farklı kişilerin e-postası çakıştı: ${twins.join(' / ')}`);
  const total = TYPO_CASES.length + HUMAN_EMAIL_CASES.length + 1;
  return { ok: total - wrong.length, total, wrong };
}

if (process.argv[1]?.endsWith('yazim-hatalari.js')) {
  const r = runTypoCases();
  console.log(`${r.ok} / ${r.total} doğru`);
  r.wrong.forEach((w) => console.log('  ', w));
}
