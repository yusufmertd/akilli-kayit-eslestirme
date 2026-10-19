// Aynı kişiye ait olduğu tespit edilen kayıt grupları ve gerekçeleri
export default function Groups({ result }) {
  const nameCol = result.types.indexOf('name');
  const reasonsOf = (group) => {
    const set = new Set(group);
    const reasons = new Set();
    result.pairs.filter((p) => set.has(p.a) && set.has(p.b)).forEach((p) => p.reasons.forEach((x) => reasons.add(x)));
    return [...reasons].join(', ');
  };

  if (!result.groups.length) return <p className="muted">Aynı kişiye ait birden fazla kayıt bulunamadı.</p>;

  return (
    <div className="groups">
      {result.groups.map((group, i) => (
        <div key={i} className="group-card">
          <h3>
            Grup {i + 1}: {nameCol >= 0 ? result.cells[group[0]][nameCol].value : ''}
            <small> · {group.length} kayıt</small>
          </h3>
          <p className="muted">Gerekçe: {reasonsOf(group)}</p>
          <table className="mini">
            <thead><tr><th>Satır</th>{result.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {group.map((r) => (
                <tr key={r}>
                  <td>{r + 2}</td>
                  {result.cells[r].map((cell, c) => (
                    <td key={c} className={cell.status}>
                      {cell.original || <i className="muted">boş</i>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
