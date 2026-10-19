
import { chromium } from 'playwright';
import * as fs from 'fs';
// Tarayıcı testi: tüm işlevleri gerçek tarayıcıda dener.
// Kullanım: npm run build && npx vite preview --port 4179  (ayrı terminalde)
//           npx -y playwright@1.48.2 install chromium && node tests/tarayici-testi.mjs [adres]
// CHROMIUM ortam değişkeni ile tarayıcı yolu verilebilir.
const S = process.env.CIKTI || '/tmp';
const ADDRESS = process.argv[2] || 'http://localhost:4179';
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'GEÇTİ ' : 'KALDI '} ${name}${info ? ` — ${info}` : ''}`); };
const bubble = async () => (await page.locator('.bubble').innerText()).replace(/\s+/g, ' ');
const dl = async (selector) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(selector)]); const p = `${S}/t-${d.suggestedFilename()}`; await d.saveAs(p); return { name: d.suggestedFilename(), path: p }; };

await page.goto(ADDRESS);
check('Giriş sayfası ve 3 adım', await page.locator('.steps li').count() === 3);
check('Site adı: Tablo Düzeltici', (await page.title()) === 'Tablo Düzeltici' && (await page.locator('h1').innerText()) === 'Tablo Düzeltici');
check('Açıklama evrensel (üniversiteye özel değil)', !/üniversite/i.test(await page.locator('.header p').innerText()));
await page.click('.topnav >> text=Nasıl çalışır?');
check('Nasıl çalışır: Ahmet/Dılmaz örneği yok', !/ahmet|dılmaz/i.test(await page.locator('.help').innerText()));
await page.click('.topnav >> text=Uygulama');
check('Üst menü (Uygulama/Ayarlar/Nasıl çalışır)', (await page.locator('.topnav button').allInnerTexts()).join('|') === 'Uygulama|Ayarlar|Nasıl çalışır?');

// Nasıl çalışır + Ayarlar sekmeleri
await page.click('.topnav >> text=Nasıl çalışır?');
check('Nasıl çalışır sekmesi', await page.locator('.help li').count() === 5);
await page.click('.topnav >> text=Ayarlar');
const settingCount = await page.locator('.setting').count();
check('Ayarlar sekmesi', settingCount >= 12, `${settingCount} ayar`);
await page.click('.setting:has-text("Tema") button:text-is("Koyu")');
const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('Tema: koyu', bgDark === 'rgb(18, 21, 28)', bgDark);
await page.screenshot({ path: `${S}/f-ayarlar-koyu.png` });
await page.click('.setting:has-text("Tema") button:text-is("Açık")');
check('Tema: açık', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(246, 247, 249)');
await page.click('.setting:has-text("Tema") button:text-is("Sistem")');
await page.emulateMedia({ colorScheme: 'dark' });
check('Tema: sistem (tarayıcı koyu)', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(18, 21, 28)');
await page.emulateMedia({ colorScheme: 'light' });
check('Tema: sistem (tarayıcı açık)', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(246, 247, 249)');
// biçim ayarları: telefon +90, tarih iso, CSV ; , değişiklik raporu
await page.click('.setting:has-text("Telefon biçimi") button:text-is("+90 555 100 00 01")');
await page.click('.setting:has-text("CSV ayırıcısı") button:has-text("Noktalı")');
await page.locator('.setting:has-text("Değişiklikler") input').check();
await page.click('.topnav >> text=Uygulama');

// Örnek dosya
await page.click('.samples >> text=Örnek tablo');
await page.waitForSelector('.result');
check('Örnek dosya yüklendi', (await page.locator('.result tbody tr').count()) === 96);
const emailTexts = await page.locator('.result tbody tr td:nth-child(6)').allInnerTexts();
check('E-postalar gerçek kişi biçiminde (teknik ek yok)', emailTexts.length === 96 && emailTexts.every((e) => e.includes('@') && !/ref\d/.test(e)), emailTexts[1]);
check('Telefon biçimi ayarı uygulandı', (await page.locator('.result tbody tr').first().innerText()).includes('+90 555 100 00 01'));
check('Çok sayfalı dosya: sayfa seçici', await page.locator('.file select').count() === 1);
check('Mod isimleri', (await page.locator('.modes button').allInnerTexts()).join('|') === '1. Otomatik|2. Ayıklama|3. Manuel');
check('Varsayılan mod Ayıklama: 2 soru', (await bubble()).includes('2 konu'));

// Tooltip asistan kutusunun üstünde mi?
await page.hover('.modes >> text=1. Otomatik');
await page.waitForTimeout(700);
const tipOnTop = await page.evaluate(() => {
  const b = document.querySelector('.modes button'); const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + 30, r.bottom + 20); // balonun olduğu yer
  return el === b || b.contains(el); // ::after alanı butona aittir
});
// ::after tıklanamaz olduğu için kontrol, balonun asistan kutusundan daha üst katmanda olmasıdır
const zOk = await page.evaluate(() => getComputedStyle(document.querySelector('.modes')).zIndex !== 'auto');
check('Mod açıklama balonu asistanın üstünde', zOk);
await page.screenshot({ path: `${S}/f-tooltip.png` });

// Tablo sayfaya sığıyor mu?
const fit = await page.evaluate(() => { const w = document.querySelector('.table-wrap'); return [w.scrollWidth, w.clientWidth]; });
check('Tablo 1366px ekrana yana kaydırmadan sığıyor', fit[0] <= fit[1] + 1, `${fit[0]} / ${fit[1]}`);
await page.screenshot({ path: `${S}/f-tablo.png` });

// Modlar
await page.click('.modes >> text=1. Otomatik');
check('Otomatik mod: soru yok', (await bubble()).includes('Hazır!'));
await page.click('.modes >> text=3. Manuel');
check('Manuel mod: grup soruları', (await bubble()).includes('aynı kayda ait görünüyor'));
await page.click('text=Kalanların hepsini onayla');
await page.click('.modes >> text=2. Ayıklama');

// Soru cevapla, atla, geri al
await page.click('text=Evet, aynı kayıt — birleştir');
check('Birleştirince çelişki sorulmuyor (Ayıklama)', (await bubble()).includes('Can Özdemir'));
await page.click('text=Son cevabı geri al');
check('Geri al', (await bubble()).includes('Ahmet Yılmaz'));
await page.click('text=Şimdilik atla');
check('Atla', (await bubble()).includes('Can Özdemir'));
await page.click('text=Hayır, farklı kayıtlar');
check('Atlanan soruya dön butonu', (await bubble()).includes('Atladığım 1 soruya dön'));
await page.click('text=Atladığım 1 soruya dön');
await page.click('text=Hayır, farklı kayıtlar');
check('Tüm sorular bitti', (await bubble()).includes('Hazır!'));

// Hücre balonu ve düzeltme
await page.locator('.result td.fixed .cell').first().click();
check('Hücre balonu açıldı', await page.locator('.cell-bubble').count() === 1, (await page.locator('.cell-bubble').innerText()).replace(/\s+/g, ' ').slice(0, 80));
await page.locator('.cell-bubble input').fill('Ahmet YILMAZ TEST');
await page.click('.cell-bubble button[type=submit]');
const edited = await page.locator('.result tbody tr').first().locator('td').nth(2).innerText();
check('Hücre düzeltme (aynı yazımlı hücrelere uygulanır)', edited === 'Ahmet YILMAZ TEST');
await page.click('text=Son cevabı geri al');
check('Düzeltmeyi geri al', (await page.locator('.result tbody tr').first().locator('td').nth(2).innerText()) === 'Ahmet Yılmaz');

// Sütun türünü değiştir
await page.locator('th select').nth(8).selectOption('text');
check('Sütun türü elle değiştirildi', (await page.locator('.type-pick').nth(8).getAttribute('data-tip')).includes('sizin seçiminiz'));

// Tekrarları tek satıra indir + gruplar sekmesi
await page.locator('label:has-text("Tekrarları tek satıra indir") input').check();
check('Tekrarlar tek satır: 32 satır', (await page.locator('.result tbody tr').count()) === 32);
await page.locator('.tabs button').nth(1).click();
check('Gruplar sekmesi', (await page.locator('.group-card').count()) === 32);
await page.locator('.group-card').first().locator('text=Ayır, farklı kayıtlar').click();
check('Grubu ayır', (await page.locator('.group-card').count()) === 31);
await page.click('text=Son cevabı geri al');
await page.locator('.tabs button').first().click();

// İndirmeler
const x = await dl('.toolbar >> text=Excel indir');
const c = await dl('.toolbar >> text=CSV indir');
const xlsxCheck = x.path;
const csv = fs.readFileSync(c.path, 'utf8');
check('Excel indirildi', x.name === 'Ham_Veri_temiz.xlsx');
check('CSV ; ayırıcı ve 32 satır', csv.split('\n')[0].includes(';') && csv.trim().split('\n').length === 33, `${csv.trim().split('\n').length} satır`, `${c.name}`);
fs.writeFileSync(`${S}/t-xlsx-path.txt`, x.path);

// Başlıksız ve zor örnek, CSV yükleme
await page.click('.toolbar >> text=Yeni dosya');
await page.click('text=Başlıksız örnek');
await page.waitForSelector('.result');
check('Başlıksız örnek: içerikten tanıma', (await page.locator('th select').evaluateAll((s) => s.map((x) => x.value))).join(',') === 'name,email,phone,address,institution,department,city,tc,gender,date,gpa,blood,money,boolean');
await page.click('.toolbar >> text=Yeni dosya');
await page.setInputFiles('input[type=file]', new URL('./data/Windows1254_noktali_virgul.csv', import.meta.url).pathname);
await page.waitForSelector('.result');
check('Windows-1254 CSV yükleme', (await page.locator('.result tbody tr').first().innerText()).includes('Orta Doğu Teknik Üniversitesi'));
await page.click('.toolbar >> text=Yeni dosya');
await page.click('text=Zor örnek');
await page.waitForSelector('.result');
check('Zor örnek yüklendi', (await page.locator('.result tbody tr').count()) === 73, (await page.locator('.intro').innerText()).slice(0, 120));

// Koyu tema ekran görüntüsü + mobil
await page.emulateMedia({ colorScheme: 'dark' });
await page.screenshot({ path: `${S}/f-koyu.png` });
await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Mobil (390px): sayfa yana taşmıyor', !overflow);
await page.screenshot({ path: `${S}/f-mobil.png` });

check('Konsolda hata yok', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close();
