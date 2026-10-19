import { useMemo, useState } from 'react';
import { processTable, collapseRows } from './engine/pipeline.js';
import { fold } from './engine/text.js';
import { readFile, downloadXlsx, downloadCsv } from './io.js';
import Upload from './components/Upload.jsx';
import Assistant from './components/Assistant.jsx';
import ResultTable from './components/ResultTable.jsx';
import Groups from './components/Groups.jsx';

// Bir sayfa için kullanıcının tüm kararları (algoritma bunlarla yeniden çalışır)
const emptyDecisions = () => ({
  pairs: {}, names: {}, choices: {}, rules: {}, cells: {}, types: {},
  dedupe: null, // null = henüz sorulmadı
  withGroup: false,
  skipped: [],
});

export default function App() {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]); // [{ name, headers, rows, skipped }]
  const [decisions, setDecisions] = useState([]); // her sayfa için
  const [history, setHistory] = useState([]); // "geri al" için önceki kararlar
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('table');
  const [error, setError] = useState('');

  // Kararlar değiştikçe algoritma baştan çalışır (birkaç yüz satır için anlık)
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
      setHistory([]);
      setActive(0);
      setTab('table');
    } catch (e) {
      setError(`Dosya okunamadı: ${e.message}`);
    }
  }

  // Aktif sayfanın kararlarını günceller; önceki hâli geri alma için saklanır
  function decide(update, remember = true) {
    if (remember) setHistory((h) => [...h.slice(-50), decisions]);
    setDecisions((all) => all.map((d, i) => (i === active ? update(structuredClone(d)) : d)));
  }
  const undo = () => {
    setDecisions(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  // Asistanın sorularına verilen cevaplar
  function answer(kind, p) {
    decide((d) => {
      if (kind === 'name') d.names[p.key] = p.value;
      if (kind === 'pair') d.pairs[p.key] = p.value;
      if (kind === 'choice') d.choices[p.id] = p.value;
      if (kind === 'rule') d.rules[p.col] = { ...d.rules[p.col], [fold(p.original)]: p.value };
      if (kind === 'dedupe') d.dedupe = p;
      return d;
    });
  }
  // Tablodan elle düzeltme: dolu hücrede aynı yazımlı tüm hücrelere, boş hücrede sadece o hücreye uygulanır
  const correct = (row, col, original, value) => (original
    ? answer('rule', { col, original, value })
    : decide((d) => { d.cells[`${row}-${col}`] = value; return d; }));
  const setType = (col, type) => decide((d) => { d.types[col] = type; return d; });
  const skip = (id) => decide((d) => { d.skipped.push(id); return d; }, false);
  const unskipAll = () => decide((d) => { d.skipped = []; return d; }, false);
  const setOption = (key, value) => decide((d) => { d[key] = value; return d; }, false);

  function download(format) {
    const options = decisions.map((d) => ({ dedupe: Boolean(d.dedupe), withGroup: d.withGroup }));
    if (format === 'xlsx') downloadXlsx(fileName, sheets, results, options);
    else downloadCsv(fileName, sheets[active], results[active], options[active], sheets.length > 1);
  }

  async function trySample(name) {
    const res = await fetch(`/ornek/${name}`);
    handleFile(new File([await res.blob()], name));
  }

  function reset() {
    setSheets([]);
    setDecisions([]);
    setHistory([]);
    setFileName('');
  }

  if (!sheets.length) {
    return (
      <main className="page">
        <Header />
        <Steps />
        <Upload onFile={handleFile} error={error} />
        <p className="samples">
          Dosyanız yok mu? Örnekle deneyin:
          <button className="link" onClick={() => trySample('Ham_Veri.xlsx')}>Ham_Veri.xlsx</button>
          <button className="link" onClick={() => trySample('Zor_Ornek.xlsx')}>Zor örnek (unvan, cinsiyet, ağır hatalar)</button>
        </p>
      </main>
    );
  }

  const sheet = sheets[active];
  const result = results[active];
  const d = decisions[active];
  const collapsed = d.dedupe ? collapseRows(result, sheet.rows) : null;

  return (
    <main className="page">
      <Header />
      <section className="toolbar">
        <div className="file">
          <strong>{fileName}</strong>
          {sheets.length > 1 && (
            <select value={active} onChange={(e) => setActive(Number(e.target.value))} aria-label="Sayfa seç">
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
            </select>
          )}
          {sheet.skipped > 0 && <span className="muted small">Üstteki {sheet.skipped} açıklama satırı atlandı.</span>}
        </div>
        <div className="actions">
          <label className="check">
            <input type="checkbox" checked={Boolean(d.dedupe)} onChange={(e) => setOption('dedupe', e.target.checked)} />
            Tekrarları tek satıra indir
          </label>
          <label className="check">
            <input type="checkbox" checked={d.withGroup} onChange={(e) => setOption('withGroup', e.target.checked)} />
            Grup no sütunu ekle
          </label>
          <button onClick={() => download('xlsx')}>Excel indir</button>
          <button onClick={() => download('csv')}>CSV indir</button>
          <button className="ghost" onClick={reset}>Yeni dosya</button>
        </div>
      </section>

      <Assistant
        result={result}
        sheet={sheet}
        dedupe={d.dedupe}
        skipped={d.skipped}
        onAnswer={answer}
        onSkip={skip}
        onUnskipAll={unskipAll}
        onUndo={undo}
        canUndo={history.length > 0}
        onDownload={download}
      />

      <nav className="tabs">
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>
          {collapsed ? `Temiz tablo (${collapsed.length} kişi, tekrarlar birleşik)` : `Temiz tablo (${result.stats.rows} satır)`}
        </button>
        <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>
          Aynı kişiye ait kayıtlar ({result.groups.length})
        </button>
      </nav>

      {tab === 'table'
        ? <ResultTable result={result} collapsed={collapsed} onCorrect={correct} onType={setType} />
        : <Groups result={result} />}
    </main>
  );
}

function Header() {
  return (
    <header className="header">
      <h1>Akıllı Kayıt Eşleştirme</h1>
      <p>
        Üniversite kayıt listelerindeki yazım hatalarını düzeltir, aynı kişiye ait kayıtları bulur, emin olamadığında size sorar.
        <span className="privacy"> Dosyanız tarayıcınızdan çıkmaz, hiçbir yerde saklanmaz.</span>
      </p>
    </header>
  );
}

function Steps() {
  return (
    <ol className="steps">
      <li><b>Yükleyin</b><span>Excel veya CSV, sütun düzeni fark etmez</span></li>
      <li><b>Soruları cevaplayın</b><span>Emin olamadığım yerleri tek tek sorarım</span></li>
      <li><b>İndirin</b><span>Temiz tablo .xlsx veya .csv olarak</span></li>
    </ol>
  );
}
