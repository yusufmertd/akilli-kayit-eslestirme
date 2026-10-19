import { useState } from 'react';

// Algoritmanın emin olamadığı durumlar: kullanıcı karar verir, algoritma bu kararla yeniden çalışır.
export default function Questions({ result, rows, onPair, onCorrect }) {
  const { pairs, cells } = result.questions;
  return (
    <section className="questions">
      <h2>Emin olamadığım durumlar</h2>
      <p className="muted">Cevapladıkça tablo yeniden hesaplanır. Cevaplamadığınız şüpheli kayıtlar birleştirilmez.</p>

      {pairs.slice(0, 5).map((p) => (
        <div key={p.key} className="question">
          <p>
            <b>Bu iki kayıt aynı kişiye mi ait?</b>
            <span className="muted"> Benzerlik %{p.score} · {p.reasons.join(', ')}</span>
          </p>
          <table className="mini">
            <thead><tr>{result.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {[p.a, p.b].map((r) => (
                <tr key={r}>{rows[r].map((v, c) => <td key={c}>{String(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <div className="buttons">
            <button onClick={() => onPair(p.key, true)}>Evet, aynı kişi</button>
            <button className="ghost" onClick={() => onPair(p.key, false)}>Hayır, farklı kişiler</button>
          </div>
        </div>
      ))}

      {cells.slice(0, 8).map((q) => (
        <CellQuestion key={`${q.col}|${q.original}`} q={q} header={result.headers[q.col]} onCorrect={onCorrect} />
      ))}

      {pairs.length + cells.length > 13 && (
        <p className="muted">… ve {pairs.length + cells.length - 13} soru daha (cevapladıkça görünecek)</p>
      )}
    </section>
  );
}

function CellQuestion({ q, header, onCorrect }) {
  const [value, setValue] = useState(q.suggestion);
  return (
    <div className="question cell-question">
      <p>
        <b>{header}</b>: "{q.original}" doğru yazım nedir?
        <span className="muted"> ({q.note})</span>
      </p>
      <form onSubmit={(e) => { e.preventDefault(); onCorrect(q.row, q.col, q.original, value.trim()); }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit">Onayla</button>
      </form>
    </div>
  );
}
