# Test Sonuçları

Komut: `npm test` (sentetik testler 5 farklı tohumla üretilir, toplam sonuç verilir).
Şüpheli çiftler bu ölçümde **birleştirilmemiş** sayılır (kullanıcı cevap vermemiş varsayılır).

| Test | Satır | Kesinlik (yanlış birleştirme yok) | Duyarlılık (bulunan eşleşme) | Hücre doğruluğu önce → sonra | Kullanıcıya soru |
|---|---|---|---|---|---|
| Ham_Veri.xlsx (verilen dosya) | 96 | %100.0 (0 yanlış) | %100.0 | %43.3 → **%100.0** | 0 |
| Sentetik - hafif kirlilik | 396 | %100.0 (0 yanlış) | %100.0 | %60.4 → **%99.6** | 17 |
| Sentetik - orta kirlilik | 418 | %100.0 (0 yanlış) | %100.0 | %44.2 → **%99.3** | 26 |
| Sentetik - ağır kirlilik | 405 | %100.0 (0 yanlış) | %100.0 | %33.8 → **%97.6** | 64 |
| Sentetik - çok sayıda aynı isimli farklı kişi | 398 | %100.0 (0 yanlış) | %100.0 | %45.5 → **%98.8** | 31 |
| Sentetik - %40 sözlükte olmayan isim | 417 | %100.0 (0 yanlış) | %99.7 | %44.0 → **%98.8** | 34 |
| Sentetik - telefon/e-posta sütunu yok | 418 | %100.0 (0 yanlış) | %98.3 | %42.4 → **%99.5** | 31 |
