import { useState } from 'react';

export default function Upload({ onFile, error }) {
  const [drag, setDrag] = useState(false);

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  }

  return (
    <label
      className={`upload ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      <strong>Excel veya CSV dosyasını buraya sürükleyin</strong>
      <span>ya da seçmek için tıklayın (.xlsx, .xls, .csv)</span>
      {error && <p className="error">{error}</p>}
    </label>
  );
}
