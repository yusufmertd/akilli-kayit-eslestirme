import { fold } from '../engine/text.js';

// Aynı kayda ait olduğu tespit edilen satır grupları ve gerekçeleri
export default function Groups({ result, confirmed, manual, onAnswer }) {
  const nameCols = result.types.flatMap((t, c) => (t === 'name' ? [c] : []));
  const nameOf = (r) => nameCols.map((c) => result.cells[r][c].value).filter(Boolean).join(' ');
  const nameCount = new Map();
  result.groups.forEach((g) => { const k = fold(nameOf(g[0])); nameCount.set(k, (nameCount.get(k) || 0) + 1); });

  const reasonsOf = (group) => {
    const set = new Set(group);
    const reasons = new Set();
    result.pairs.filter((p) => set.has(p.a) && set.has(p.b)).forEach((p) => p.reasons.forEach((x) => reasons.add(x)));
    return [...reasons].join(', ') || 'sizin onayınızla birleştirildi';
  };

  if (!result.groups.length) return <p className="muted">Tekrar eden (eşleşen) kayıt bulunamadı.</p>;

  return (
    <div className="groups">
      {result.groups.map((group, i) => (
        <div key={group[0]} className="group-card">
          <h3>
            {i + 1}. {nameOf(group[0]) || 'Kayıt'}
            <small> · {result.summaries[i]}</small>
            {nameCount.get(fold(nameOf(group[0]))) > 1 && <span className="badge">Aynı adda başka kayıt da var</span>}
            {confirmed[group.join(',')] === true && <span className="badge ok">Onaylandı</span>}
            {confirmed[group.join(',')] !== true && (manual
              ? <span className="badge">Onay bekliyor</span>
              : <span className="badge ok">Otomatik eşleşti</span>)}
          </h3>
          <p className="muted">Neden aynı kayıt: {reasonsOf(group)}</p>
          <div className="buttons">
            <button data-tip="Bu satırların aynı kayıt olduğunu onaylarsın" onClick={() => onAnswer('group', { key: group.join(','), value: true })}>Doğru, aynı kayıt</button>
            <button className="ghost" data-tip="Bu satırları birbirinden ayırır; her biri ayrı kayıt olarak kalır" onClick={() => onAnswer('group', { key: group.join(','), value: false })}>Ayır, farklı kayıtlar</button>
          </div>
          <div className="mini-wrap">
            <table className="mini">
              <thead><tr><th>Satır</th>{result.headers.map((h, c) => <th key={c}>{h}</th>)}</tr></thead>
              <tbody>
                {group.map((r) => (
                  <tr key={r}>
                    <td>{r + 2}</td>
                    {result.cells[r].map((cell, c) => (
                      <td key={c} title={cell.status !== 'same' ? `Yeni: ${cell.value}` : ''}>
                        {cell.original || <i className="muted">boş</i>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
