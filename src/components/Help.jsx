// "Nasıl çalışır?" sekmesi: yöntemin kullanıcıya kısa anlatımı
export default function Help() {
  return (
    <section className="help">
      <h2>Nasıl çalışır?</h2>
      <p className="muted">Tablo Düzeltici her türlü tabloyla çalışır: müşteri, öğrenci, personel, ürün, adres, etkinlik listeleri…</p>
      <ol>
        <li>
          <b>Sütunları tanır.</b> Her sütun 58 kategoriden birine atanır (ad soyad, e-posta, telefon, adres, şehir, tarih, kurum,
          şirket, para, IBAN…). Başlık anlamsızsa içerikten tahmin edilir: <code>@</code> → e-posta, <code>05…</code> → telefon,
          "Mah. / Cad." → adres. Tanınmayan sütunlara genel kurallar uygulanır.
        </li>
        <li>
          <b>Her hücreyi düzeltir.</b> Türkçe karakterler, büyük/küçük harf, fazla boşluklar, kısaltmalar, harf hataları ve
          biçimler (telefon, tarih, adres, e-posta) sözlüklerle ve dosyanın kendisinden öğrenilen yazımlarla düzeltilir.
        </li>
        <li>
          <b>Tekrar eden kayıtları bulur.</b> Benzer ad tek başına yetmez: telefon, e-posta veya kimlik numarası gibi bilgiler
          eşleşirse aynı kayıt, çelişirse farklı kayıt sayılır. Bu bilgiler yoksa diğer sütunlar birlikte değerlendirilir.
        </li>
        <li>
          <b>En doğru yazımı seçer.</b> Aynı kaydın satırlarındaki yazımlardan en doğrusu (çoğunluk + sözlük + doğru karakterler)
          tüm satırlara yazılır, boş hücreler doldurulur.
        </li>
        <li>
          <b>Emin olamazsa sorar.</b> Moda göre: <i>Otomatik</i> hiç sormaz, <i>Ayıklama</i> sadece belirsiz eşleşmeleri sorar,
          <i> Manuel</i> her şeyi sorar. Cevaplar algoritmaya geri beslenir.
        </li>
      </ol>
      <p className="muted">
        Renkler: <span className="fixed pill">düzeltildi</span> <span className="filled pill">dolduruldu</span>{' '}
        <span className="unsure pill">emin değilim</span>. Bir hücreye tıklayıp eski hâlini görebilir, düzeltebilirsiniz.
      </p>
    </section>
  );
}
