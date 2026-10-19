// Tablonun başlık satırını bulur. Bazı dosyalarda üstte "2024 Katılımcı Listesi" gibi
// başlık / açıklama satırları olur; gerçek sütun başlıkları birkaç satır aşağıdadır.
// Kural: ilk 10 satır içinde, en geniş satırın en az yarısı kadar dolu hücresi olan ve
// hücreleri metin (sayı değil) olan ilk satır başlıktır.

const filledCount = (row) => row.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;

export function findHeaderRow(data) {
  const width = Math.max(0, ...data.slice(0, 20).map(filledCount));
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    const filled = row.filter((v) => String(v ?? '').trim() !== '');
    if (filled.length >= Math.max(1, Math.ceil(width / 2)) && filled.every((v) => typeof v === 'string')) return i;
  }
  return 0;
}
