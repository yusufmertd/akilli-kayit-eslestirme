import { useState } from 'react';
import { fold } from '../engine/text.js';
import { CATEGORY_GROUPS, categoryOf } from '../engine/categories.js';

const GROUP_LABELS = { Kişi: 'Kişi bilgileri', İletişim: 'İletişim', Eğitim: 'Eğitim', İş: 'İş', Kayıt: 'Kayıt / Etkinlik', Genel: 'Genel biçimler', Diğer: 'Diğer' };

const STATUS_TEXT = { fixed: 'Düzeltildi', filled: 'Aynı kişinin diğer kaydından dolduruldu', same: 'Değişmedi' };

// collapsed: tekrarlar birleşik görünümde [{ row, values }] (yoksa tüm satırlar gösterilir)
export default function ResultTable({ result, collapsed, onCorrect, onType }) {
  const [open, setOpen] = useState(null); // açık balon: "satır-sütun"
  const groupNo = new Map(result.groups.flatMap((g, i) => g.map((r) => [r, i + 1])));
  const rows = collapsed || result.cells.map((_, r) => ({ row: r }));

  return (
    <>
      <div className="legend">
        <span className="fixed">düzeltildi</span>
        <span className="filled">dolduruldu</span>
        <span className="unsure">emin değilim</span>
        <span className="muted">Bir hücreye tıklayın: eski değeri görün, onaylayın ya da düzeltin.</span>
      </div>
      <div className="table-wrap">
        <table className="result">
          <thead>
            <tr>
              <th title="Aynı kişiye ait kayıtlar aynı grup numarasını alır">Kişi</th>
              {result.headers.map((h, c) => (
                <th key={c}>
                  {h}
                  <span className="type-pick" data-tip={`${categoryOf(result.types[c]).hint}. Neden bu tür: ${result.typeReasons[c]}. Yanlışsa listeden değiştirin.`}>
                    {/* Görünen kısa etiket; asıl liste üzerine şeffaf yerleşir, böylece tablo genişliğini büyütmez */}
                    <span className="type-label">{categoryOf(result.types[c]).label}</span>
                    <select value={result.types[c]} onChange={(e) => onType(c, e.target.value)} aria-label={`${h} sütununun türü`}>
                      {CATEGORY_GROUPS.map(({ group, items }) => (
                        <optgroup key={group} label={GROUP_LABELS[group] || group}>
                          {items.map((cat) => <option key={cat.id} value={cat.id} title={cat.hint}>{cat.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row: r, values }) => (
              <tr key={r}>
                <td className="group">{groupNo.get(r) ?? ''}</td>
                {result.cells[r].map((cell, c) => {
                  const id = `${r}-${c}`;
                  const shown = values ? values[c] : cell.value;
                  return (
                    <td key={c} className={`t-${result.types[c]} ${cell.status} ${cell.unsure ? 'unsure' : ''} ${open === id ? 'open' : ''}`}>
                      <button className="cell" onClick={() => setOpen(open === id ? null : id)}>{String(shown ?? '')}</button>
                      {open === id && (
                        <CellBubble
                          cell={cell}
                          header={result.headers[c]}
                          sameCount={cell.original ? result.cells.filter((row) => fold(row[c].original) === fold(cell.original)).length : 1}
                          onClose={() => setOpen(null)}
                          onSave={(v) => { setOpen(null); onCorrect(r, c, cell.original, v); }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Hücre balonu: ne değişti, neden değişti, doğru mu?
function CellBubble({ cell, header, sameCount, onClose, onSave }) {
  const [value, setValue] = useState(cell.value);
  return (
    <div className="cell-bubble" role="dialog" aria-label={`${header} hücresi`}>
      <button className="close" onClick={onClose} aria-label="Kapat">×</button>
      <p className="small"><b>{STATUS_TEXT[cell.status]}</b>{cell.note && <span className="muted"> · {cell.note}</span>}</p>
      {cell.status !== 'same' && (
        <p className="small">Dosyadaki hâli: <q>{cell.original || 'boş'}</q></p>
      )}
      {cell.unsure && (
        <div className="buttons">
          <span className="small">Bu değer doğru mu?</span>
          <button data-tip="Değeri onaylar; aynı yazıma sahip tüm hücreler için geçerli olur" onClick={() => onSave(cell.value)}>Evet</button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); onSave(value.trim()); }}>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" data-tip="Yazdığın değeri kaydeder; aynı yazıma sahip tüm hücrelere uygulanır">Kaydet</button>
      </form>
      {sameCount > 1 && <p className="muted small">Bu yazım {sameCount} hücrede geçiyor; hepsine uygulanır.</p>}
    </div>
  );
}
