import { useState } from 'react';

export const TYPE_LABELS = {
  id: 'Kimlik / No',
  name: 'Ad Soyad',
  institution: 'Üniversite / Kurum',
  department: 'Bölüm',
  email: 'E-posta',
  phone: 'Telefon',
  address: 'Adres',
  city: 'Şehir',
  text: 'Diğer metin',
};

const STATUS_TITLES = { fixed: 'Düzeltildi', filled: 'Dolduruldu', same: 'Değişmedi' };

export default function ResultTable({ result, onCorrect, onType }) {
  const [editing, setEditing] = useState(null); // "satır-sütun"
  const groupNo = new Map(result.groups.flatMap((g, i) => g.map((r) => [r, i + 1])));

  return (
    <>
      <div className="legend">
        <span className="fixed">düzeltildi</span>
        <span className="filled">aynı kişinin diğer kaydından dolduruldu</span>
        <span className="unsure">emin değilim</span>
        <span className="muted">Eski değeri görmek için hücrenin üzerine gelin, düzeltmek için tıklayın.</span>
      </div>
      <div className="table-wrap">
        <table className="result">
          <thead>
            <tr>
              <th>Grup</th>
              {result.headers.map((h, c) => (
                <th key={c}>
                  {h}
                  <select value={result.types[c]} onChange={(e) => onType(c, e.target.value)}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.cells.map((row, r) => (
              <tr key={r}>
                <td className="group">{groupNo.get(r) ?? ''}</td>
                {row.map((cell, c) => {
                  const id = `${r}-${c}`;
                  const cls = `${cell.status} ${cell.unsure ? 'unsure' : ''}`;
                  const title = cell.status === 'same' ? cell.note
                    : `${STATUS_TITLES[cell.status]}: "${cell.original}" → "${cell.value}"${cell.note ? ` (${cell.note})` : ''}`;
                  return (
                    <td key={c} className={cls} title={title} onClick={() => setEditing(id)}>
                      {editing === id ? (
                        <input
                          autoFocus
                          defaultValue={cell.value}
                          onBlur={(e) => { setEditing(null); if (e.target.value !== cell.value) onCorrect(r, c, cell.original, e.target.value.trim()); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(null); }}
                        />
                      ) : cell.value}
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
