// Başlıkları anlamsız ("Sütun 1, Sütun 2…") örnek dosya üretir: site sütun türlerini İÇERİKTEN tanımalı.
// Çalıştırma: node tests/make-blank-header-sample.js
import * as fs from 'fs';
import * as XLSX from 'xlsx/xlsx.mjs';

XLSX.set_fs(fs);
const rows = [
  ['AHMET YILMAZ', 'ahmet.yilmaz@gmial.com', '0555 100 00 01', 'Yeni Mah. Bilim Cad. No 8', 'ULUDAĞ ÜNİV.', 'Bilgisayar Müh.', 'bursa', '10000000146', 'E', '05.03.1998', '3.45', 'a rh+', '1250 tl', 'evet'],
  ['Ahmet Yilmaz', 'AHMET.YILMAZ@GMAIL.COM', '+90 (555) 100-00-01', 'No.8 - Yeni Mahallesi / Bilim Caddesi', 'Uludag Universitesi', 'Bilgisayar Muhendisligi', 'Bursa', '10000000146', 'Erkek', '1998-03-05', '3,45', 'A Rh+', '₺1.250', 'Evet'],
  ['Zeynep Kaya', 'zeynep.kaya@hotmial.com', '5551000002', 'Merkez Mah. Akademi Sk. No 15', 'İTÜ', 'Endüstri Müh.', 'İSTANBUL', '10000000078', 'K', '12/11/1999', '3.10', '0 rh-', '900 TL', 'hayır'],
  ['zeynep kaya', 'zeynep.kaya@hotmail.com', '0555 100 00 02', 'Merkez Mahallesi, Akademi Sokak No: 15', 'Istanbul Teknik Universitesi', 'Endustri Muhendisligi', 'Istanbul', '10000000078', 'Kadın', '12.11.1999', '3,1', '0 Rh-', '900', 'Hayır'],
  ['Mehmet Demir', 'mehmet.demir@outlook.com', '0532 200 30 40', 'Bilim Mah. Teknoloji Blv. No 22', 'ODTÜ', 'EEM', 'Ankara', '', 'E', '01.01.2000', '2.80', 'B Rh+', '1.500,50 TL', 'Evet'],
  ['Elif Şahin', 'elif.sahin@gmail.com', '0533 300 40 50', 'Akademi Mah. Yazilim Cad. No 29', 'Boğaziçi Üniversitesi', 'Psikoloji', 'İstanbul', '', 'Kadın', '15.07.2001', '3.90', 'AB Rh+', '2000 TL', 'evet'],
];
const headers = rows[0].map((_, c) => `Sütun ${c + 1}`);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Basliksiz');
XLSX.writeFile(wb, new URL('../public/ornek/Basliksiz_Ornek.xlsx', import.meta.url).pathname);
XLSX.writeFile(wb, new URL('./data/Basliksiz_Ornek.xlsx', import.meta.url).pathname);
console.log('yazıldı');
