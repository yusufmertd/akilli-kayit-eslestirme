# Akıllı Kayıt Eşleştirme Sistemi

Üniversite kayıt listelerindeki (öğrenci / katılımcı tabloları) yazım hatalarını düzelten, aynı kişiye ait
farklı yazılmış kayıtları bulan ve temizlenmiş tabloyu **.xlsx** veya **.csv** olarak veren web uygulaması.

```
Abmet Dılmaz │ Uludag Universitesi │ Bilgisayar Muhendisligi │ No.8 - Yeni Mahallesi / Bilim Caddesi
        ↓
Ahmet Yılmaz │ Uludağ Üniversitesi │ Bilgisayar Mühendisliği │ Yeni Mahallesi, Bilim Caddesi No: 8
```

- **Konu:** Türkiye'deki üniversiteler (ad soyad, üniversite, bölüm, e-posta, telefon, adres, şehir)
- **Teknoloji:** React + Vite, JavaScript, Excel okuma/yazma için SheetJS
- **Gizlilik:** Dosya tarayıcıdan hiç çıkmaz. Sunucu yok, veritabanı yok, `localStorage` yok.
  Dosya yalnızca sayfanın belleğinde işlenir; sayfa kapanınca hiçbir iz kalmaz.
- **Kural:** Satırlar silinmez veya birleştirilmez. Satır sayısı aynı kalır, sadece yazımlar düzeltilir
  ve aynı kişinin diğer kayıtlarından boş alanlar doldurulur.

## Kullanım

1. Excel veya CSV dosyasını sürükleyip bırakın (birden çok sayfalı Excel dosyaları da desteklenir).
2. Uygulama sütun türlerini başlık ve içerikten tahmin eder (yanlışsa sütun başlığındaki listeden değiştirebilirsiniz).
3. Sonuç tablosunda **yeşil** = düzeltildi, **mavi** = aynı kişinin diğer kaydından dolduruldu,
   **sarı** = emin değilim. Hücrenin üzerine gelince eski değer ve gerekçe görünür; tıklayınca düzeltebilirsiniz.
4. Algoritmanın emin olamadığı durumlar **"Emin olamadığım durumlar"** kutusunda soru olarak çıkar:
   - "Bu iki kayıt aynı kişiye mi ait?" → Evet / Hayır
   - "Bu değerin doğru yazımı nedir?" → kullanıcı yazar; düzeltme aynı yazıma sahip **tüm** hücrelere uygulanır
     ve algoritma bu bilgiyle yeniden çalışır.
5. **Excel indir** veya **CSV indir**. İsterseniz "Grup numarası sütunu ekle" ile eşleşen kayıtları işaretleyebilirsiniz.

## Eşleştirme sistemi nasıl çalışır?

Kod `src/engine/` klasöründedir ve arayüzden bağımsızdır (Node.js'te de test edilir).

| Dosya | Görevi |
|---|---|
| `text.js` | Türkçe büyük/küçük harf, karşılaştırma anahtarı, Damerau-Levenshtein mesafesi |
| `dictionaries.js` | 196 üniversite + kısaltmaları, 119 bölüm, 81 il, ~430 Türkçe ad/soyad, adres kısaltmaları |
| `fields.js` | Sütun türü tespiti ve her tür için temizleyici |
| `matcher.js` | İki kaydın aynı kişi olup olmadığına karar verme, gruplama |
| `pipeline.js` | Tüm adımları sırayla çalıştıran ana akış |

### Adım 1 — Karşılaştırma anahtarı
Her değer, küçük harfe çevrilip Türkçe karakterleri ASCII'ye indirgenerek bir **anahtara** dönüştürülür:
`"ULUDAĞ ÜNİV."`, `"Uludag Univ"` → `"uludag univ"`. Böylece büyük/küçük harf ve Türkçe karakter farkları
karşılaştırmayı bozmaz. (Türkçe'ye özgü `I/ı`, `İ/i` dönüşümleri `tr-TR` yereli ile yapılır.)

### Adım 2 — Alan bazında temizlik (sözlük + bulanık eşleşme)
- **Üniversite / Bölüm:** Önce kısaltma (`ODTÜ`, `İTÜ`, `DEÜ`, `FTR`, `MBG`, `DUİM`), sonra kelime kısaltmaları açılır
  (`Üniv.` → Üniversitesi, `Müh.` → Mühendisliği), sonra sözlükte birebir arama, sonra yarım kelime eşleşmesi
  (`Turizm İşletm.` → Turizm İşletmeciliği), en son harf hatası toleranslı arama (%85+ benzerlik ve rakipten belirgin üstün).
  Katlanınca iki üniversiteye denk gelen kısaltmalar (`ÇÜ` Çukurova / `CÜ` Cumhuriyet) belirsiz sayılır.
- **Ad Soyad:** Her kelime ad/soyad sözlüğünde aranır. Kısa kelimelerde hata toleransı düşüktür
  (3 harf: 0, 4–7 harf: 1, 8+ harf: 2 harf hatası) ki `Can`/`Cem` gibi farklı isimler karışmasın.
  `Abmet` → `Ahmet`, `Dılmaz` → `Yılmaz`. Kullanıcının özellikle yazdığı Türkçe harfi silen düzeltme yapılmaz
  (`Miraç` → `Mira` olmaz).
- **Dosyadan öğrenme:** Dosyada bir yerde `Kampüs` yazıyorsa başka yerdeki `Kampus` da düzeltilir.
  Dosyada en az iki kez geçen isimler (sözlükte olmasa bile) bilinen isim sayılır; ancak sözlükteki bir isme
  1 harf uzaklıkta olanlar (tekrar eden yazım hatası: `Neihr` ~ `Nehir`) öğrenilmez.
- **E-posta:** boşluklar silinir, küçük harfe çevrilir. İsimle karşılaştırılarak kaymış nokta onarılır
  (`cano.zdemir.ege@` → `can.ozdemir.ege@`).
- **Telefon:** tek biçime: `0555 100 00 01`. **Adres:** `Mah./Cad./Sk./Blv.` açılır, tek biçime getirilir:
  `Yeni Mahallesi, Bilim Caddesi No: 8`. **Şehir:** 81 il listesiyle düzeltilir.
- Sözlükte olmayan kategorik değerler, aynı sütundaki çok benzer (%88+) daha güvenilir bir değere çekilir.

### Adım 3 — Aynı kişiye ait kayıtları bulma
Benzer isim **tek başına yeterli değildir** (veride "Ahmet Yılmaz – Uludağ" ve "Ahmet Yılmaz – Hacettepe" iki farklı kişidir).
Karar kuralları:

| Durum | Karar |
|---|---|
| İsim benzerliği < %60 | eşleşme yok |
| Telefon veya e-posta eşleşiyor, çelişki yok | **kesin** (isim %75+ ise) |
| Telefon veya e-posta eşleşiyor ama diğeri çelişiyor | **kullanıcıya sor** |
| Telefon veya e-posta çelişiyor | farklı kişi |
| Kimlik bilgisi yok: isim %90+ ve kurum aynı ve adres aynı | **kesin** |
| Kimlik bilgisi yok: isim %85+ ve kurum ya da adres aynı, hiçbiri çelişmiyor | **kullanıcıya sor** |

E-postada sayılar farklıysa (`ali.can.1@` / `ali.can.2@`) farklı kişi kabul edilir. Kesin çiftler birleşim-bul
(union-find) ile gruplara dönüştürülür.

### Adım 4 — Grup içinde en doğru yazımı seçme
Her alan için gruptaki adaylar puanlanır: **diğer adaylara benzerlik toplamı** (çoğunluk oyu + "merkez" yazım)
+ sözlükte bulunma + Türkçe karakter içerme + kullanıcı onayı. Kazanan değer gruptaki tüm satırlara yazılır,
boş hücreler doldurulur. Kişiye ait farklı e-posta / telefon varsa ezilmez.

### Adım 5 — Emin olunamayan durumlar
Şüpheli çiftler ve doğrulanamayan değerler soru olarak çıkar. Cevaplar algoritmaya geri beslenir ve
her şey yeniden hesaplanır (aynı iki grup için ikinci kez sorulmaz).

## Test sonuçları

`npm test` komutu ile ölçülür (`tests/evaluate.js`).

**1. Verilen dosya (`tests/data/Ham_Veri.xlsx`):** 96 satır, 32 kişi × 3 kayıt. Doğru gruplar telefon ve e-posta
referanslarına bakılarak elle doğrulandı (`tests/data/Ham_Veri_dogru_gruplar.json`). Beklenen yazım her grubun
"Web Başvurusu" satırıdır.

**2. Sentetik veriler (`tests/generate.js`):** Algoritmanın yalnızca örnek dosyaya göre ayarlanmadığını görmek için
doğru cevabı bilinen veriler üretildi: rastgele kişiler oluşturulup her birinin 1–3 kopyası bozuldu
(Türkçe karakter kaybı, BÜYÜK/küçük harf, harf silme/takas/değiştirme, kısaltmalar, eksik alanlar,
farklı telefon/adres biçimleri, kaymış e-posta noktası). Her senaryo 5 farklı tohumla çalıştırılır.

| Test | Satır | Kesinlik (yanlış birleştirme yok) | Duyarlılık (bulunan eşleşme) | Hücre doğruluğu önce → sonra | Kullanıcıya soru |
|---|---|---|---|---|---|
| Ham_Veri.xlsx (verilen dosya) | 96 | %100.0 (0 yanlış) | %100.0 | %43.3 → **%100.0** | 0 |
| Sentetik - hafif kirlilik | 396 | %100.0 (0 yanlış) | %100.0 | %60.4 → **%99.6** | 17 |
| Sentetik - orta kirlilik | 418 | %100.0 (0 yanlış) | %100.0 | %44.2 → **%99.3** | 26 |
| Sentetik - ağır kirlilik | 405 | %100.0 (0 yanlış) | %100.0 | %33.8 → **%97.6** | 64 |
| Sentetik - çok sayıda aynı isimli farklı kişi | 398 | %100.0 (0 yanlış) | %100.0 | %45.5 → **%98.8** | 31 |
| Sentetik - %40 sözlükte olmayan isim | 417 | %100.0 (0 yanlış) | %99.7 | %44.0 → **%98.8** | 34 |
| Sentetik - telefon/e-posta sütunu yok | 418 | %100.0 (0 yanlış) | %98.3 | %42.4 → **%99.5** | 31 |

- **Kesinlik:** "aynı kişi" denen çiftlerin ne kadarı gerçekten aynı kişi. Yanlış birleştirme en zararlı hata
  olduğu için sistem tasarımı bunu önceliklendirir.
- **Duyarlılık:** gerçekte aynı kişi olan çiftlerin ne kadarı bulundu. (Şüpheli çiftler cevapsız = birleştirilmemiş sayıldı.)
- **Hücre doğruluğu:** her hücrenin beklenen temiz değerle birebir aynı olma oranı.

Kalan hataların büyük kısmı ilkesel olarak düzeltilemeyen durumlardır: tek kaydı olan kişinin boş alanı
(doldurulacak kaynak yok) veya sözlükte olmayan ve dosyada hiç doğru yazılmamış isimler (`Tumerkan` → `Tümerkan`).
Bu tür değerler sarı ile işaretlenip kullanıcıya sorulur.

### Geliştirme sürecinde testlerin yakaladığı hatalar
İlk sürüm örnek dosyada %100 başarı verdi, ancak sentetik testler gerçek zayıflıkları ortaya çıkardı:

| Sorun | Çözüm | Etki |
|---|---|---|
| `zeynep.akcali.2@` ve `.3@` %93 benzer → aynı kişi sanıldı | E-postadaki sayılar farklıysa farklı kişi | Kesinlik %56–88 → %100 |
| Tek kez geçen yazım hatası (`Çamkak`) "bilinen isim" öğrenildi | Sadece 2+ kez geçen isimler öğrenilir | |
| Grup içi eşitlikte yanlış aday seçildi | Benzerlik toplamı ile "merkez" yazım seçimi | Hücre doğruluğu %95 → %99 |
| Kimlik sütunu yokken 400 satırda ~290 soru | Kurum/adres çelişkisinde sorma, aynı gruplar için tek soru | 296 → 31 soru |
| `ÇÜ` kısaltması `CÜ` (Cumhuriyet) ile karıştı | Önce birebir kısaltma, katlanmış çakışmalar belirsiz | |
| `Miraç` → `Mira` düzeltildi | Türkçe harfi silen düzeltme yapılmaz | |

## Yapay zekâ araçlarının kullanımı

Proje **Claude Code** (Anthropic) ile birlikte geliştirildi:
- **Veri analizi:** Örnek dosyadaki hata türlerinin çıkarılması (kısaltmalar, ASCII yazım, kaymış e-posta noktası,
  adres biçimleri, aynı isimli farklı kişiler).
- **Tasarım ve kod:** Eşleştirme kurallarının (kimlik bilgisi + isim + kurum/adres) tasarımı ve kodun yazılması.
  Kod bilinçli olarak sade tutuldu, her adım açıklama satırlarıyla anlatıldı.
- **Sözlükler:** Üniversite, bölüm, il ve ad/soyad listelerinin hazırlanması.
- **Test ve iyileştirme döngüsü:** Sentetik veri üreteci ve ölçüm betiği yazıldı; hatalar tek tek incelenip
  yukarıdaki tablodaki iyileştirmeler yapıldı. Arayüz Playwright ile gerçek tarayıcıda denendi.

Bütün kararlar (eşik değerleri, "benzer isim tek başına yetmez" ilkesi, emin olunamayınca sorma) test sonuçlarına
bakılarak verildi ve README'de gerekçeleriyle açıklandı.

## Geliştirme

```bash
npm install
npm run dev      # geliştirme sunucusu
npm test         # doğruluk ölçümü (tests/SONUCLAR.md dosyasını da günceller)
npm run build    # yayın için derleme (dist/)
node tests/make-sample.js   # arayüzde denemek için kirli örnek dosya üretir
```

Vercel'e yayımlama: depo Vercel'e bağlanınca Vite projesi otomatik algılanır (Build: `npm run build`, Çıktı: `dist`).
