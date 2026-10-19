# Test Sonuçları

Komut: `npm test` (sentetik testler 5 farklı tohumla üretilir, toplam sonuç verilir).

- **Yanlış birleştirme:** farklı kişilere ait olduğu hâlde "aynı kişi" denen satır çifti sayısı (en zararlı hata).
- **Bulunan eşleşme:** gerçekte aynı kişiye ait satır çiftlerinin ne kadarının bulunduğu.
- **Hücre doğruluğu:** her hücrenin beklenen temiz değerle birebir aynı olma oranı.
- **Soru:** sistemin kullanıcıya sorduğu soru sayısı (ilk açılışta).
- **Sorular cevaplanınca:** sanal bir kullanıcı tüm soruları doğru cevapladıktan sonraki sonuç.

| Test | Satır | Yanlış birleştirme | Bulunan eşleşme | Hücre doğruluğu: önce → sistem | Soru | Sorular cevaplanınca: hücre doğruluğu / bulunan eşleşme |
|---|---|---|---|---|---|---|
| Ham_Veri.xlsx (verilen dosya) | 96 | 0 (kesinlik %100.0) | %100.0 | %43.3 → **%100.0** | 2 | **%100.0** / %100.0 (0 yanlış) |
| Sentetik - hafif kirlilik | 396 | 0 (kesinlik %100.0) | %100.0 | %60.4 → **%99.6** | 38 | **%99.7** / %100.0 (0 yanlış) |
| Sentetik - orta kirlilik | 418 | 0 (kesinlik %100.0) | %100.0 | %44.2 → **%99.1** | 46 | **%99.4** / %100.0 (0 yanlış) |
| Sentetik - ağır kirlilik | 405 | 0 (kesinlik %100.0) | %100.0 | %33.8 → **%97.5** | 79 | **%98.1** / %100.0 (0 yanlış) |
| Sentetik - çok sayıda aynı isimli farklı kişi | 398 | 0 (kesinlik %100.0) | %100.0 | %45.5 → **%98.8** | 65 | **%99.3** / %100.0 (0 yanlış) |
| Sentetik - %40 sözlükte olmayan isim | 417 | 0 (kesinlik %100.0) | %99.7 | %44.0 → **%98.8** | 48 | **%99.3** / %100.0 (0 yanlış) |
| Sentetik - telefon/e-posta sütunu yok | 418 | 0 (kesinlik %100.0) | %98.3 | %42.4 → **%99.2** | 50 | **%99.8** / %100.0 (0 yanlış) |
| Sentetik - Ad ve Soyad ayrı sütunlarda | 418 | 0 (kesinlik %100.0) | %100.0 | %45.1 → **%98.9** | 63 | **%99.5** / %100.0 (0 yanlış) |
| Sentetik - ek sütunlar (unvan, cinsiyet, serbest metin) | 418 | 0 (kesinlik %100.0) | %100.0 | %43.7 → **%99.4** | 46 | **%99.6** / %100.0 (0 yanlış) |
| Sentetik - gmail/hotmail adresleri + alan adı hataları | 418 | 0 (kesinlik %100.0) | %100.0 | %42.0 → **%99.1** | 46 | **%99.4** / %100.0 (0 yanlış) |
| Sentetik - hepsi bir arada, ağır kirlilik | 382 | 0 (kesinlik %100.0) | %99.6 | %35.4 → **%98.0** | 88 | **%99.0** / %100.0 (0 yanlış) |

- Başlık satırı tespiti (üstte açıklama satırları olan dosyalar): tüm örnekler doğru
- Windows-1254 kodlu, ";" ayraçlı, başlığı 3. satırda, Ad/Soyad ayrı CSV (`tests/data/Windows1254_noktali_virgul.csv`): 5 / 5 satır doğru
