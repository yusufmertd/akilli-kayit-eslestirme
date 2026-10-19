import { useEffect, useMemo, useState } from 'react';
import { processTable, collapseRows } from './engine/pipeline.js';
import { fold } from './engine/text.js';
import { readFile, downloadXlsx, downloadCsv } from './io.js';
import Upload from './components/Upload.jsx';
import Assistant from './components/Assistant.jsx';
import ResultTable from './components/ResultTable.jsx';
import Groups from './components/Groups.jsx';
import Settings, { DEFAULT_SETTINGS } from './components/Settings.jsx';
import Help from './components/Help.jsx';

// Bir sayfa için kullanıcının tüm kararları (algoritma bunlarla yeniden çalışır)
const emptyDecisions = (settings) => ({
  pairs: {}, names: {}, choices: {}, rules: {}, cells: {}, types: {}, groups: {},
  mode: settings.defaultMode, // 'auto' = hiç sorma, 'suspicious' = ayıklama (sadece şüphelileri sor), 'manual' = her şeyi sor
  review: undefined, // manuel modda "kalan eşleşmelerin hepsini onayla" denirse 'all'
  dedupe: settings.dedupe ? true : null, // null = henüz sorulmadı
  withGroup: settings.withGroup,
  skipped: [],
});

export default function App() {
  // Ayarlar sadece bellekte tutulur (tarayıcıya hiçbir şey kaydedilmez); sayfa yenilenince varsayılana döner
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [view, setView] = useState('app'); // 'app' | 'settings' | 'help'
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]); // [{ name, headers, rows, skipped }]
  const [decisions, setDecisions] = useState([]); // her sayfa için
  const [history, setHistory] = useState([]); // "geri al" için önceki kararlar
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('table');
  const [error, setError] = useState('');

  // Tema: sistem / açık / koyu
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.classList.toggle('no-tips', !settings.tips);
    root.classList.toggle('no-colors', !settings.highlight);
    root.classList.toggle('compact', settings.density === 'compact');
    root.classList.toggle('nowrap', !settings.wrap);
  }, [settings]);

  // Kararlar veya biçim ayarları değiştikçe algoritma baştan çalışır (birkaç yüz satır için anlık)
  const format = useMemo(
    () => ({ phone: settings.phoneFormat, date: settings.dateFormat, humanEmail: settings.humanEmail }),
    [settings.phoneFormat, settings.dateFormat, settings.humanEmail],
  );
  const results = useMemo(
    () => sheets.map((s, i) => processTable(s.headers, s.rows, { ...decisions[i], format })),
    [sheets, decisions, format],
  );

  async function handleFile(file) {
    setError('');
    try {
      const loaded = await readFile(file);
      if (!loaded.length) throw new Error('Dosyada veri bulunamadı.');
      setFileName(file.name);
      setSheets(loaded);
      setDecisions(loaded.map(() => emptyDecisions(settings)));
      setHistory([]);
      setActive(0);
      setTab('table');
      setView('app');
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
      if (kind === 'group') d.groups[p.key] = p.value;
      if (kind === 'review') d.review = p;
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

  function download(formatName) {
    const options = decisions.map((d) => ({ dedupe: Boolean(d.dedupe), withGroup: d.withGroup, report: settings.changeReport, sep: settings.csvSep }));
    if (formatName === 'xlsx') downloadXlsx(fileName, sheets, results, options);
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

  const nav = <Nav view={view} onView={setView} />;
  if (view === 'settings') return <Page nav={nav}><Settings settings={settings} onChange={setSettings} /></Page>;
  if (view === 'help') return <Page nav={nav}><Help /></Page>;

  if (!sheets.length) {
    return (
      <Page nav={nav}>
        <Steps />
        <Upload onFile={handleFile} error={error} />
        <p className="samples">
          Dosyanız yok mu? Örnekle deneyin:
          <button className="link" data-tip="Yazım hatalı ve tekrar eden kayıtlar içeren 96 satırlık bir örnek yükler" onClick={() => trySample('Ham_Veri.xlsx')}>Örnek tablo</button>
          <button className="link" data-tip="Çok sütunlu ve ağır yazım hataları olan zor bir örnek yükler" onClick={() => trySample('Zor_Ornek.xlsx')}>Zor örnek (ağır hatalar)</button>
          <button className="link" data-tip="Sütun başlıkları 'Sütun 1, Sütun 2…' olan bir dosya: site her sütunun ne olduğunu içeriğinden tanır" onClick={() => trySample('Basliksiz_Ornek.xlsx')}>Başlıksız örnek (içerikten tanıma)</button>
        </p>
      </Page>
    );
  }

  const sheet = sheets[active];
  const result = results[active];
  const d = decisions[active];
  const collapsed = d.dedupe ? collapseRows(result, sheet.rows) : null;

  return (
    <Page nav={nav}>
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
          <label className="check" data-tip="Tekrar eden (aynı) kayıtlar tabloda ve indirilen dosyada tek satıra iner">
            <input type="checkbox" checked={Boolean(d.dedupe)} onChange={(e) => setOption('dedupe', e.target.checked)} />
            Tekrarları tek satıra indir
          </label>
          <label className="check" data-tip="İndirilen dosyaya, eşleşen kayıtların aynı numarayı aldığı bir sütun eklenir">
            <input type="checkbox" checked={d.withGroup} onChange={(e) => setOption('withGroup', e.target.checked)} />
            Grup no sütunu ekle
          </label>
          <button data-tip="Temizlenmiş tabloyu Excel dosyası (.xlsx) olarak indirir" onClick={() => download('xlsx')}>Excel indir</button>
          <button data-tip={`Temizlenmiş tabloyu CSV dosyası olarak indirir (ayırıcı: ${settings.csvSep === ';' ? 'noktalı virgül' : 'virgül'})`} onClick={() => download('csv')}>CSV indir</button>
          <button className="ghost" data-tip="Bu dosyayı kapatır; bellekte hiçbir iz kalmaz" onClick={reset}>Yeni dosya</button>
        </div>
      </section>

      <ModeSwitch mode={d.mode} onChange={(m) => decide((x) => { x.mode = m; x.skipped = []; return x; })} />

      <Assistant
        result={result}
        sheet={sheet}
        mode={d.mode}
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
        <button className={tab === 'table' ? 'on' : ''} data-tip="Düzeltilmiş tabloyu gösterir; hücreye tıklayıp düzeltebilirsin" onClick={() => setTab('table')}>
          {collapsed ? `Temiz tablo (${collapsed.length} satır, tekrarlar birleşik)` : `Temiz tablo (${result.stats.rows} satır)`}
        </button>
        <button className={tab === 'groups' ? 'on' : ''} data-tip="Aynı kayda ait olduğunu düşündüğüm satırları gerekçeleriyle gösterir" onClick={() => setTab('groups')}>
          Eşleşen kayıtlar ({result.groups.length})
        </button>
      </nav>

      {tab === 'table'
        ? <ResultTable result={result} collapsed={collapsed} onCorrect={correct} onType={setType} />
        : <Groups result={result} confirmed={d.groups} manual={d.mode === 'manual' && d.review !== 'all'} onAnswer={answer} />}
    </Page>
  );
}

// Soru sorma düzeyi: kullanıcı ne kadar karar vermek istediğini seçer
export const MODES = [
  ['auto', '1. Otomatik', 'Hiç soru sormaz: eşleşmeleri, yazım düzeltmelerini ve çelişkileri algoritma çözer. Emin olmadığı eşleşmeleri birleştirmez.'],
  ['suspicious', '2. Ayıklama', 'Önerilen: şüpheli durumları ayıklar ve sadece onları sorar (aynı adlı farklı kayıtlar, şüpheli kayıt çiftleri). Gerisini kendisi düzeltir.'],
  ['manual', '3. Manuel', 'Her eşleşmeyi, her çelişkiyi ve emin olamadığı her yazımı tek tek sorar.'],
];
function ModeSwitch({ mode, onChange }) {
  return (
    <div className="modes" role="radiogroup" aria-label="Soru sorma modu">
      <span className="muted small">Mod:</span>
      {MODES.map(([id, label, tip]) => (
        <button key={id} role="radio" aria-checked={mode === id} className={mode === id ? 'on' : ''} data-tip={tip} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Page({ nav, children }) {
  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>Tablo Düzeltici</h1>
          <p>
            Her türlü Excel ve CSV tablosundaki yazım hatalarını düzeltir, aynı kaydın farklı yazımlarını bulur, emin olamadığında size sorar.
            <span className="privacy"> Dosyanız tarayıcınızdan çıkmaz, hiçbir yerde saklanmaz.</span>
          </p>
        </div>
        {nav}
      </header>
      {children}
      <footer className="footer muted small">
        Tüm işlemler tarayıcınızda yapılır; dosyanız hiçbir sunucuya gönderilmez ve kaydedilmez.
        {' · '}<a href="https://github.com/yusufmertd/akilli-kayit-eslestirme" target="_blank" rel="noreferrer">Kaynak kod (GitHub)</a>
      </footer>
    </main>
  );
}

function Nav({ view, onView }) {
  const items = [['app', 'Uygulama', 'Dosya yükleme ve temizleme ekranı'], ['settings', 'Ayarlar', 'Tema, varsayılan mod, biçimler ve indirme seçenekleri'], ['help', 'Nasıl çalışır?', 'Eşleştirme yönteminin kısa açıklaması']];
  return (
    <nav className="topnav" aria-label="Ana menü">
      {items.map(([id, label, tip]) => (
        <button key={id} className={view === id ? 'on' : ''} data-tip={tip} onClick={() => onView(id)} aria-current={view === id ? 'page' : undefined}>
          {label}
        </button>
      ))}
    </nav>
  );
}

function Steps() {
  return (
    <ol className="steps">
      <li><b>Yükleyin</b><span>Excel veya CSV, sütun düzeni fark etmez</span></li>
      <li><b>Modu seçin</b><span>Otomatik, Ayıklama (önerilen) veya Manuel</span></li>
      <li><b>İndirin</b><span>Temiz tablo .xlsx veya .csv olarak</span></li>
    </ol>
  );
}
