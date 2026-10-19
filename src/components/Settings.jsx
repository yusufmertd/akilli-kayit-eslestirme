// Ayarlar sekmesi. Ayarlar sadece bellekte tutulur: tarayıcıya (localStorage vb.) hiçbir şey yazılmaz.

export const DEFAULT_SETTINGS = {
  theme: 'system', // 'system' | 'light' | 'dark'
  defaultMode: 'suspicious', // yeni dosyalar için mod
  dedupe: false, // tekrarları varsayılan olarak tek satıra indir
  withGroup: false, // indirilen dosyaya grup no sütunu ekle
  changeReport: false, // Excel'e "Değişiklikler" sayfası ekle
  csvSep: ',', // CSV ayırıcı
  phoneFormat: 'spaced', // 0555 100 00 01
  dateFormat: 'dmy', // 05.03.1998
  wrap: true, // uzun metinler hücrede alt satıra geçsin (tablo sayfaya sığar)
  density: 'normal', // 'normal' | 'compact'
  highlight: true, // değişen hücreleri renklendir
  tips: true, // üzerine gelince açıklama balonları
};

const GROUPS = [
  ['Görünüm', [
    ['theme', 'Tema', 'Sistem: bilgisayarınızın açık/koyu ayarını izler', [['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']]],
    ['density', 'Tablo yoğunluğu', 'Sıkı: daha küçük yazı ve dar satırlar, daha çok satır görünür', [['normal', 'Rahat'], ['compact', 'Sıkı']]],
    ['wrap', 'Uzun metinleri alt satıra kaydır', 'Açıkken tablo sayfa genişliğine sığar, yana kaydırma gerekmez', 'bool'],
    ['highlight', 'Değişen hücreleri renklendir', 'Yeşil: düzeltildi, mavi: dolduruldu, sarı: emin değilim', 'bool'],
    ['tips', 'Açıklama balonlarını göster', 'Butonların üzerine gelince ne işe yaradıkları yazar', 'bool'],
  ]],
  ['Eşleştirme', [
    ['defaultMode', 'Yeni dosyalar için mod', 'Dosya açıldıktan sonra üstteki mod seçiciden de değiştirilebilir', [['auto', '1. Otomatik'], ['suspicious', '2. Ayıklama'], ['manual', '3. Manuel']]],
    ['dedupe', 'Tekrarları varsayılan olarak tek satıra indir', 'Kapalıyken (görev kuralı) tüm satırlar korunur, sadece yazımlar düzeltilir', 'bool'],
  ]],
  ['Biçimler', [
    ['phoneFormat', 'Telefon biçimi', 'Tüm telefon numaraları bu biçime getirilir', [['spaced', '0555 100 00 01'], ['plain', '05551000001'], ['intl', '+90 555 100 00 01']]],
    ['dateFormat', 'Tarih biçimi', 'Tüm tarih sütunları bu biçime getirilir', [['dmy', '05.03.1998'], ['iso', '1998-03-05'], ['slash', '05/03/1998']]],
  ]],
  ['İndirme', [
    ['csvSep', 'CSV ayırıcısı', 'Türkçe Excel CSV dosyalarını genelde noktalı virgülle açar', [[',', 'Virgül ( , )'], [';', 'Noktalı virgül ( ; )']]],
    ['withGroup', 'Grup no sütunu ekle', 'Aynı kişiye ait kayıtlar aynı numarayı alır', 'bool'],
    ['changeReport', 'Excel\'e "Değişiklikler" sayfası ekle', 'Hangi hücrenin neden değiştiğini satır satır listeleyen ek bir sayfa', 'bool'],
  ]],
];

export default function Settings({ settings, onChange }) {
  const set = (key, value) => onChange({ ...settings, [key]: value });
  return (
    <section className="settings">
      <h2>Ayarlar</h2>
      <p className="muted">
        Ayarlar hemen uygulanır. Gizlilik gereği hiçbir yere kaydedilmez; sayfa yenilenince varsayılanlara döner.
      </p>
      {GROUPS.map(([title, items]) => (
        <fieldset key={title} className="setting-group">
          <legend>{title}</legend>
          {items.map(([key, label, hint, kind]) => (
            <div key={key} className="setting">
              <div>
                <b>{label}</b>
                <span className="muted small">{hint}</span>
              </div>
              {kind === 'bool' ? (
                <label className="switch">
                  <input type="checkbox" checked={settings[key]} onChange={(e) => set(key, e.target.checked)} aria-label={label} />
                  <span />
                </label>
              ) : (
                <div className="segmented" role="radiogroup" aria-label={label}>
                  {kind.map(([value, text]) => (
                    <button key={value} role="radio" aria-checked={settings[key] === value} className={settings[key] === value ? 'on' : ''} onClick={() => set(key, value)}>
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </fieldset>
      ))}
      <button className="ghost" onClick={() => onChange(DEFAULT_SETTINGS)}>Varsayılanlara dön</button>
    </section>
  );
}
