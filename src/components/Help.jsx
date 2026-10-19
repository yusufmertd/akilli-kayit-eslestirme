// "Nasıl çalışır?" sekmesi: eşleştirme yönteminin kullanıcıya kısa anlatımı
export default function Help() {
  return (
    <section className="help">
      <h2>Nasıl çalışır?</h2>
      <ol>
        <li>
          <b>Sütunları tanır.</b> Her sütun 58 kategoriden birine atanır (ad soyad, üniversite, e-posta, telefon, adres…).
          Başlık anlamsızsa içerikten tahmin edilir: <code>@</code> → e-posta, <code>05…</code> → telefon, "Mah. / Cad." → adres.
        </li>
        <li>
          <b>Her hücreyi düzeltir.</b> Türkçe karakterler, büyük/küçük harf, kısaltmalar (<code>ODTÜ</code>, <code>Müh.</code>),
          harf hataları (<code>Abmet Dılmaz</code> → <code>Ahmet Yılmaz</code>) ve biçimler (telefon, tarih, adres) sözlüklerle düzeltilir.
          Sözlükte 196 üniversite, 119 bölüm, 81 il ve yüzlerce Türkçe isim var.
        </li>
        <li>
          <b>Aynı kişiyi bulur.</b> Benzer isim tek başına yetmez: telefon, e-posta veya T.C. kimlik no eşleşirse aynı kişi,
          çelişirse farklı kişi sayılır. Kimlik bilgisi yoksa isim + kurum + adres birlikte değerlendirilir.
        </li>
        <li>
          <b>En doğru yazımı seçer.</b> Aynı kişinin kayıtlarındaki yazımlardan en doğrusu (çoğunluk + sözlük + Türkçe karakter)
          tüm kayıtlara yazılır, boş hücreler doldurulur. Kurum/fakülte/bölümde en uzun ad, e-postada kişinin gerçek adresi seçilir.
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
