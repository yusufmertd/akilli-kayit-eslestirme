import { useMemo, useState } from 'react';
import { processTable } from './engine/pipeline.js';
import { fold } from './engine/text.js';
import { readFile, downloadXlsx, downloadCsv } from './io.js';
import Upload from './components/Upload.jsx';
import Questions from './components/Questions.jsx';
import ResultTable from './components/ResultTable.jsx';
import Groups from './components/Groups.jsx';

const emptyDecisions = () => ({ pairs: {}, rules: {}, cells: {}, types: {} });

export default function App() {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]); // [{ name, headers, rows }]
  const [decisions, setDecisions] = useState([]); // her sayfa için kullanıcı kararları
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('table');
  const [withGroup, setWithGroup] = useState(false);
  const [error, setError] = useState('');

  // Kararlar değiştikçe algoritma baştan çalışır (100-1000 satır için anlık)
  const results = useMemo(
    () => sheets.map((s, i) => processTable(s.headers, s.rows, decisions[i])),
    [sheets, decisions],
  );

  async function handleFile(file) {
    setError('');
    try {
      const loaded = await readFile(file);
      if (!loaded.length) throw new Error('Dosyada veri bulunamadı.');
      setFileName(file.name);
      setSheets(loaded);
      setDecisions(loaded.map(emptyDecisions));
      setActive(0);
    } catch (e) {
      setError(`Dosya okunamadı: ${e.message}`);
    }
  }

  // Aktif sayfanın kararlarını günceller
  function decide(update) {
    setDecisions((all) => all.map((d, i) => (i === active ? update(structuredClone(d)) : d)));
  }
  const answerPair = (key, same) => decide((d) => { d.pairs[key] = same; return d; });
  const setType = (col, type) => decide((d) => { d.types[col] = type; return d; });
  // Kullanıcının yazdığı düzeltme: aynı yazımlı tüm hücrelere uygulanır; boş hücrede sadece o hücreye
  const correct = (row, col, original, value) => decide((d) => {
    if (original) d.rules[col] = { ...d.rules[col], [fold(original)]: value };
    else d.cells[`${row}-${col}`] = value;
    return d;
  });

  function reset() {
    setSheets([]);
    setDecisions([]);
    setFileName('');
  }

  if (!sheets.length) {
    return (
      <main className="page">
        <Header />
        <Upload onFile={handleFile} error={error} />
      </main>
    );
  }

  const sheet = sheets[active];
  const result = results[active];
  const questionCount = result.questions.pairs.length + result.questions.cells.length;

  return (
    <main className="page">
      <Header />
      <section className="toolbar">
        <div>
          <strong>{fileName}</strong>
          {sheets.length > 1 && (
            <select value={active} onChange={(e) => setActive(Number(e.target.value))}>
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div className="actions">
          <label className="check">
            <input type="checkbox" checked={withGroup} onChange={(e) => setWithGroup(e.target.checked)} />
            Grup numarası sütunu ekle
          </label>
          <button onClick={() => downloadXlsx(fileName, sheets, results, withGroup)}>Excel indir (.xlsx)</button>
          <button onClick={() => downloadCsv(fileName, sheet, result, withGroup, sheets.length > 1)}>CSV indir</button>
          <button className="ghost" onClick={reset}>Yeni dosya</button>
        </div>
      </section>

      <section className="stats">
        <Stat label="Satır" value={result.stats.rows} />
        <Stat label="Düzeltilen hücre" value={result.stats.fixed} tone="fixed" />
        <Stat label="Doldurulan boş hücre" value={result.stats.filled} tone="filled" />
        <Stat label="Eşleşen kayıt grubu" value={result.stats.groups} />
        <Stat label="Onay bekleyen soru" value={questionCount} tone={questionCount ? 'unsure' : ''} />
      </section>

      {questionCount > 0 && (
        <Questions result={result} rows={sheet.rows} onPair={answerPair} onCorrect={correct} />
      )}

      <nav className="tabs">
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>Temizlenmiş tablo</button>
        <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>
          Eşleşen kayıtlar ({result.groups.length})
        </button>
      </nav>

      {tab === 'table'
        ? <ResultTable result={result} onCorrect={correct} onType={setType} />
        : <Groups result={result} />}
    </main>
  );
}

function Header() {
  return (
    <header className="header">
      <h1>Akıllı Kayıt Eşleştirme</h1>
      <p>
        Üniversite kayıt listelerindeki yazım hatalarını düzeltir, aynı kişiye ait kayıtları bulur.
        <span className="privacy"> Dosyanız tarayıcınızdan çıkmaz, hiçbir yerde saklanmaz.</span>
      </p>
    </header>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}
