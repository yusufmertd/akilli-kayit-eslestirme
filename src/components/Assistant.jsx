import { useState } from 'react';
import { KEEP_OWN } from '../engine/pipeline.js';
import { fold } from '../engine/text.js';

// Asistan baloncuğu: algoritmanın emin olamadığı konuları kullanıcıya TEK TEK sorar.
// Her cevaptan sonra algoritma yeniden çalışır ve sıradaki soru gelir.
const MODE_TEXT = {
  auto: '1. Otomatik moddayım: tüm kararları ben verdim, hiçbir şey sormuyorum.',
  suspicious: '2. Ayıklama modundayım: sadece şüpheli eşleşmeleri ayıklayıp soruyorum; yazım hatalarını, kurum/fakülte ve e-posta seçimini kendim yaptım.',
  manual: '3. Manuel moddayım: her eşleşmeyi ve her çelişkiyi sana soruyorum.',
};

export default function Assistant({ result, sheet, mode, dedupe, skipped, onAnswer, onSkip, onUnskipAll, onUndo, canUndo, onDownload }) {
  const queue = result.questions.filter((q) => !skipped.includes(q.id));
  const q = queue[0];
  const { stats } = result;

  let body;
  if (q) body = <Question key={q.id} q={q} result={result} sheet={sheet} onAnswer={onAnswer} />;
  else if (mode === 'manual' && dedupe === null && stats.duplicates > 0) body = <DedupeQuestion stats={stats} onAnswer={onAnswer} />;
  else body = <Done stats={stats} dedupe={dedupe} skippedCount={skipped.length} onUnskipAll={onUnskipAll} onDownload={onDownload} />;

  return (
    <section className="assistant" aria-live="polite">
      <div className="avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2M7.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" /></svg>
      </div>
      <div className="bubble">
        <p className="intro">
          {stats.rows} satırı inceledim: <b>{stats.fixed}</b> hücreyi düzelttim, <b>{stats.filled}</b> boş hücreyi
          doldurdum, <b>{stats.people}</b> farklı kişi buldum.
          {' '}{MODE_TEXT[mode]}
          {queue.length > 0 && <> Sana soracağım <b>{queue.length}</b> konu var.</>}
        </p>
        {body}
        <div className="bubble-footer">
          {q && (
            <button className="link" data-tip="Bu soruyu sona bırakır; algoritmanın tahmini şimdilik kalır" onClick={() => onSkip(q.id)}>Şimdilik atla</button>
          )}
          {canUndo && <button className="link" data-tip="Verdiğin son cevabı iptal eder, önceki duruma döner" onClick={onUndo}>Son cevabı geri al</button>}
        </div>
      </div>
    </section>
  );
}

function Question({ q, result, sheet, onAnswer }) {
  const header = (c) => result.headers[c];
  const nameCol = result.types.indexOf('name');

  if (q.kind === 'group') {
    return (
      <div className="ask">
        <p>Bu <b>{q.rows.length} kayıt</b> aynı kişiye ait görünüyor:</p>
        <ul className="people">
          {q.variants.map((v) => <li key={v}>{v}</li>)}
        </ul>
        <p className="muted small">Neden: {q.reasons.join(', ')}</p>
        <RawRows rows={q.rows} result={result} sheet={sheet} />
        <p>Hepsini <b>“{q.proposed}”</b> olarak birleştirip düzelteyim mi?</p>
        <div className="buttons">
          <button data-tip="Bu kayıtlar tek kişi sayılır; yazımlar düzeltilir, eksik bilgiler birbirinden tamamlanır" onClick={() => onAnswer('group', { key: q.key, value: true })}>
            Evet, birleştir
          </button>
          <button className="ghost" data-tip="Bu kayıtlar birbirinden ayrılır; her biri ayrı kişi olarak kalır" onClick={() => onAnswer('group', { key: q.key, value: false })}>
            Hayır, bunlar farklı kişiler
          </button>
          <button className="link" data-tip="Kalan tüm otomatik eşleşmeleri kabul eder, bir daha bunları sormam" onClick={() => onAnswer('review', 'all')}>
            Kalanların hepsini onayla
          </button>
        </div>
      </div>
    );
  }

  if (q.kind === 'name') {
    return (
      <div className="ask">
        <p><b>“{q.name}”</b> isminde <b>{q.people.length} farklı kişi</b> buldum:</p>
        <ul className="people">
          {q.people.map((p, i) => <li key={i}><span className="tag">{i + 1}. kişi</span> {p.summary}</li>)}
        </ul>
        <p>Bunlar aynı kişi mi? Birleştireyim mi?</p>
        <div className="buttons">
          <button data-tip="Bu kişiler tek kişi sayılır; farklı olan bilgiler için 'hangisi doğru?' diye sorarım" onClick={() => onAnswer('name', { key: q.key, value: true })}>Evet, aynı kişi — birleştir</button>
          <button className="ghost" data-tip="Aynı isimli ama farklı kişiler olarak ayrı kalırlar" onClick={() => onAnswer('name', { key: q.key, value: false })}>Hayır, farklı kişiler</button>
        </div>
      </div>
    );
  }

  if (q.kind === 'pair') {
    return (
      <div className="ask">
        <p>Bu iki kayıt <b>aynı kişiye</b> ait olabilir <span className="muted">(benzerlik %{q.score}: {q.reasons.join(', ')})</span>:</p>
        <RawRows rows={[q.a, q.b]} result={result} sheet={sheet} />
        <div className="buttons">
          <button data-tip="İki kayıt tek kişi sayılır, bilgileri birbirinden tamamlanır" onClick={() => onAnswer('pair', { key: q.key, value: true })}>Evet, aynı kişi</button>
          <button className="ghost" data-tip="Kayıtlar ayrı kalır, bu iki kayıt için bir daha sormam" onClick={() => onAnswer('pair', { key: q.key, value: false })}>Hayır, farklı kişiler</button>
        </div>
      </div>
    );
  }

  if (q.kind === 'conflict') {
    return (
      <div className="ask">
        <p>
          <b>{q.name || (nameCol >= 0 ? result.cells[q.rows[0]][nameCol].value : 'Bu kişi')}</b> için kayıtlarda farklı
          <b> {header(q.col)}</b> bilgileri var. Hangisi doğru?
        </p>
        <div className="buttons vertical">
          {q.options.map((o) => (
            <button key={o.value} data-tip="Bu kişinin tüm kayıtlarına bu değer yazılır" onClick={() => onAnswer('choice', { id: q.id, value: o.value })}>
              {o.value} <small>({o.count} kayıtta)</small>
            </button>
          ))}
          <button className="ghost" data-tip="Değerler eşitlenmez; her satır kendi (düzeltilmiş) değeriyle kalır" onClick={() => onAnswer('choice', { id: q.id, value: KEEP_OWN })}>Her kayıt kendi değerini korusun</button>
        </div>
        <FreeText label="Hiçbiri değil, doğrusu:" initial="" onSave={(v) => onAnswer('choice', { id: q.id, value: v })} />
      </div>
    );
  }

  // kind === 'cell': algoritmanın emin olamadığı bir yazım
  const sameCount = result.cells.filter((row) => fold(row[q.col].original) === fold(q.original)).length;
  return (
    <div className="ask">
      <p>
        <b>{header(q.col)}</b> sütununda <q>{q.original}</q> yazıyor ({q.note}).
        {q.suggestion !== q.original ? <> Doğru yazımı <q><b>{q.suggestion}</b></q> olabilir mi?</> : ' Bu yazım doğru mu?'}
      </p>
      <div className="buttons">
        <button data-tip="Önerim onaylanır ve aynı yazıma sahip tüm hücrelere uygulanır" onClick={() => onAnswer('rule', { col: q.col, original: q.original, value: q.suggestion })}>Evet, doğru</button>
      </div>
      <FreeText label="Hayır, doğrusu:" initial={q.suggestion} onSave={(v) => onAnswer('rule', { col: q.col, original: q.original, value: v })} />
      {sameCount > 1 && <p className="muted small">Cevabın bu yazıma sahip {sameCount} hücrenin hepsine uygulanacak.</p>}
    </div>
  );
}

function DedupeQuestion({ stats, onAnswer }) {
  return (
    <div className="ask">
      <p>
        Sorular bitti. Dosyada <b>{stats.people}</b> kişi var ama <b>{stats.duplicates}</b> kayıt aynı kişinin tekrarı.
        İndireceğin dosyada her kişi <b>tek satır</b> olsun mu?
      </p>
      <div className="buttons">
        <button data-tip="Aynı kişinin tekrar eden kayıtları indirilen dosyada tek satıra iner" onClick={() => onAnswer('dedupe', true)}>Evet, her kişi tek satır ({stats.people} satır)</button>
        <button className="ghost" data-tip="Satır sayısı değişmez, sadece yazımlar düzeltilir" onClick={() => onAnswer('dedupe', false)}>Hayır, tüm satırlar kalsın ({stats.rows} satır)</button>
      </div>
    </div>
  );
}

function Done({ stats, dedupe, skippedCount, onUnskipAll, onDownload }) {
  return (
    <div className="ask">
      <p>
        Hazır! Dosyan indirilmeye hazır ({dedupe ? `${stats.people} satır, tekrarlar birleşik` : `${stats.rows} satır`}).
        Tabloda bir hücreye tıklayarak istediğin düzeltmeyi yapabilirsin.
      </p>
      <div className="buttons">
        <button data-tip="Temizlenmiş tabloyu Excel dosyası olarak bilgisayarına indirir" onClick={() => onDownload('xlsx')}>Excel indir (.xlsx)</button>
        <button data-tip="Temizlenmiş tabloyu CSV (virgülle ayrılmış metin) olarak indirir" onClick={() => onDownload('csv')}>CSV indir</button>
        {skippedCount > 0 && <button className="ghost" data-tip="Atladığın soruları yeniden sormaya başlarım" onClick={onUnskipAll}>Atladığım {skippedCount} soruya dön</button>}
      </div>
    </div>
  );
}

function FreeText({ label, initial, onSave }) {
  const [value, setValue] = useState(initial);
  return (
    <form className="free" onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSave(value.trim()); }}>
      <label>{label}</label>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Doğru yazımı girin" />
      <button type="submit" className="ghost" data-tip="Yazdığın değer kaydedilir ve tabloya uygulanır">Kaydet</button>
    </form>
  );
}

// Kayıtların dosyadaki ilk (ham) hâli
function RawRows({ rows, result, sheet }) {
  return (
    <div className="mini-wrap">
      <table className="mini">
        <thead><tr><th>Satır</th>{result.headers.map((h, c) => <th key={c}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}><td>{r + 2 + (sheet.skipped || 0)}</td>{sheet.rows[r].map((v, c) => <td key={c}>{String(v)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
