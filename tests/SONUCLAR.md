# Test Sonuçları

Komut: `npm test` (sentetik testler 5 farklı tohumla üretilir, toplam sonuç verilir).
Sentetik testler varsayılan **"2. Ayıklama"** modunda ölçülür.

- **Yanlış birleştirme:** farklı kişilere ait olduğu hâlde "aynı kişi" denen satır çifti sayısı (en zararlı hata).
- **Bulunan eşleşme:** gerçekte aynı kişiye ait satır çiftlerinin ne kadarının bulunduğu.
- **Hücre doğruluğu:** her hücrenin beklenen temiz değerle birebir aynı olma oranı.
- **Soru:** sistemin kullanıcıya sorduğu soru sayısı (ilk açılışta).
- **Sorular cevaplanınca:** sanal bir kullanıcı tüm soruları doğru cevapladıktan sonraki sonuç.

| Test | Satır | Yanlış birleştirme | Bulunan eşleşme | Hücre doğruluğu: önce → sistem | Soru | Sorular cevaplanınca: hücre doğruluğu / bulunan eşleşme |
|---|---|---|---|---|---|---|
| Ham_Veri.xlsx – 1. Otomatik mod (hiç soru yok) | 96 | 0 (kesinlik %100.0) | %100.0 | %43.3 → **%100.0** | 0 | **%100.0** / %100.0 (0 yanlış) |
| Ham_Veri.xlsx – 2. Ayıklama modu | 96 | 0 (kesinlik %100.0) | %100.0 | %43.3 → **%100.0** | 2 | **%100.0** / %100.0 (0 yanlış) |
| Ham_Veri.xlsx – 3. Manuel mod | 96 | 0 (kesinlik %100.0) | %100.0 | %43.3 → **%100.0** | 34 | **%100.0** / %100.0 (0 yanlış) |
| Sentetik - hafif kirlilik | 396 | 0 (kesinlik %100.0) | %100.0 | %60.4 → **%99.6** | 21 | **%99.6** / %100.0 (0 yanlış) |
| Sentetik - orta kirlilik | 418 | 0 (kesinlik %100.0) | %100.0 | %44.2 → **%99.1** | 21 | **%99.1** / %100.0 (0 yanlış) |
| Sentetik - ağır kirlilik | 405 | 0 (kesinlik %100.0) | %100.0 | %33.8 → **%97.6** | 18 | **%97.6** / %100.0 (0 yanlış) |
| Sentetik - çok sayıda aynı isimli farklı kişi | 398 | 0 (kesinlik %100.0) | %100.0 | %45.5 → **%98.8** | 35 | **%98.8** / %100.0 (0 yanlış) |
| Sentetik - %40 sözlükte olmayan isim | 417 | 0 (kesinlik %100.0) | %99.7 | %44.0 → **%98.7** | 21 | **%98.7** / %99.7 (0 yanlış) |
| Sentetik - telefon/e-posta sütunu yok | 418 | 0 (kesinlik %100.0) | %98.3 | %42.4 → **%99.2** | 23 | **%99.3** / %99.3 (0 yanlış) |
| Sentetik - Ad ve Soyad ayrı sütunlarda | 418 | 0 (kesinlik %100.0) | %100.0 | %45.1 → **%99.3** | 21 | **%99.3** / %100.0 (0 yanlış) |
| Sentetik - ek sütunlar (unvan, cinsiyet, serbest metin) | 418 | 0 (kesinlik %100.0) | %100.0 | %43.7 → **%99.4** | 21 | **%99.4** / %100.0 (0 yanlış) |
| Sentetik - gmail/hotmail adresleri + alan adı hataları | 418 | 0 (kesinlik %100.0) | %100.0 | %42.0 → **%99.1** | 21 | **%99.1** / %100.0 (0 yanlış) |
| Sentetik - başlıklar anlamsız ("Sütun 1, Sütun 2…") | 418 | 0 (kesinlik %100.0) | %100.0 | %43.7 → **%99.4** | 21 | **%99.4** / %100.0 (0 yanlış) |
| Sentetik - hepsi bir arada, ağır kirlilik | 382 | 0 (kesinlik %100.0) | %99.6 | %35.4 → **%98.5** | 24 | **%98.5** / %99.6 (0 yanlış) |

- Yaygın yazım hataları (tests/yazim-hatalari.js; e-posta, telefon, tarih, şehir, ad, üniversite, bölüm, fakülte, unvan, adres): 86 / 86 örnek doğru
- Kategori tanıma (58 kategori; başlıktan ve başlık anlamsızsa içerikten): 55 / 55 örnek doğru
- Başlık satırı tespiti (üstte açıklama satırları olan dosyalar): tüm örnekler doğru
- Windows-1254 kodlu, ";" ayraçlı, başlığı 3. satırda, Ad/Soyad ayrı CSV (`tests/data/Windows1254_noktali_virgul.csv`): 5 / 5 satır doğru
