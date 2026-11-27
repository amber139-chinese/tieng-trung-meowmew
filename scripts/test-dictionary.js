#!/usr/bin/env node
/* Kiểm thử bộ máy tìm kiếm thật (dictionary/search-engine.js) trên dữ liệu đã dựng.  Chạy: node scripts/test-dictionary.js */
const fs = require('fs'), path = require('path');
const E = require('../dictionary/search-engine.js');
const ROOT = path.resolve(__dirname, '..');
let loads = 0, bytes = 0;
const load = (rel) => new Promise((res, rej) => {
  fs.readFile(path.join(ROOT, 'dictionary', rel), 'utf8', (err, txt) => {
    if (err) return rej(err);
    loads++; bytes += Buffer.byteLength(txt); res(JSON.parse(txt));
  });
});
const mk = () => E.create({ load, base: '../data/dictionary/' });
let pass = 0, fail = 0;
const line = (r) => r.results.slice(0, 3).map(x => `${x.entry.s}[${x.entry.d || x.entry.p}] ${x.entry.m[0].slice(0, 28)}`).join(' | ');
async function t(name, q, check, o) {
  const eng = mk(); loads = 0; bytes = 0; const t0 = Date.now();
  let r, err = null;
  try { r = await eng.search(q, o); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  const ok = !err && check(r);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} q="${q}"  ${ms}ms, ${loads} file, ${(bytes / 1024).toFixed(0)} KB, ${err ? 'LỖI ' + err.message : r.total + ' kq'}`);
  if (err || !ok) console.log('      →', err ? err.stack : line(r));
  else console.log('      →', line(r));
}
const has = (r, s, i) => r.results.slice(0, i || 5).some(x => x.entry.s === s);
const first = (r, s) => r.results.length && r.results[0].entry.s === s;
(async () => {
  await t('giản thể', '学习', r => first(r, '学习'));
  await t('phồn thể', '學習', r => first(r, '学习'));
  await t('pinyin có dấu', 'xuéxí', r => first(r, '学习'));
  await t('pinyin không dấu', 'xuexi', r => has(r, '学习'));
  await t('pinyin không dấu, có cách', 'xue xi', r => has(r, '学习'));
  await t('pinyin số thanh', 'xue2xi2', r => first(r, '学习'));
  await t('số thanh sai (xue4xi2) lọc ra', 'xue4xi2', r => !has(r, '学习', 50));
  await t('nghĩa Việt: học tập', 'học tập', r => has(r, '学习', 10));
  await t('nghĩa Việt có dấu: mèo', 'mèo', r => first(r, '猫'));
  await t('nghĩa Việt không dấu: meo', 'meo', r => has(r, '猫', 10));
  await t('pinyin ü: nv3 / nǚ', 'nv3', r => has(r, '女'));
  await t('pinyin ü: nü3', 'nü3', r => has(r, '女'));
  await t('pinyin có dấu 1 âm tiết: mā', 'mā', r => has(r, '妈') && !has(r, '吗', 50));
  await t('pinyin dở dang (prefix): xuex', 'xuex', r => has(r, '学习', 20));
  await t('Hán: tiền tố 学', '学', r => first(r, '学') && r.total > 10);
  await t('câu dài → tách từ', '我每天学习两个小时', r => r.segments.length >= 4 && r.segments.some(s => s.word === '学习'));
  await t('từ không tồn tại (Hán)', '𠀀𠀁𠀂', r => r.total === 0);
  await t('từ không tồn tại (Latin)', 'qwxzvv', r => r.total === 0);
  await t('chuỗi rỗng', '   ', r => r.total === 0);
  await t('ký tự đặc biệt không crash', '<script>"\'%\\', r => r.total >= 0);
  await t('chuỗi rất dài không crash', 'a'.repeat(500), r => r.total >= 0);
  await t('phân trang (offset)', '学', r => r.results.length === 10 && r.hasMore, { limit: 10, offset: 10 });
  // lookupHeadword + startsWith + supplement
  const eng = mk();
  const rd = await eng.lookupHeadword('行');
  const ok1 = rd.length === 2 && rd.map(e => e.p).sort().join() === 'háng,xíng';
  console.log(`${ok1 ? 'PASS' : 'FAIL'}  lookupHeadword 行 = các cách đọc  → ${rd.map(e => e.p)}`); ok1 ? pass++ : fail++;
  const sw = await eng.startsWith('学习', 5);
  const ok2 = sw.length > 0 && sw.every(e => e.s.startsWith('学习') && e.s !== '学习');
  console.log(`${ok2 ? 'PASS' : 'FAIL'}  startsWith 学习  → ${sw.map(e => e.s).join(' ')}`); ok2 ? pass++ : fail++;
  const sp = await eng.supplementFor((await eng.lookupHeadword('学习'))[0]);
  const ok3 = sp && sp.han_viet === 'Học tập';
  console.log(`${ok3 ? 'PASS' : 'FAIL'}  supplementFor 学习 (biên soạn tay)  → ${sp && sp.han_viet}`); ok3 ? pass++ : fail++;
  // dữ liệu nhập từ các trang HSK: loại từ + ví dụ + cấp HSK
  const aq = (await eng.lookupHeadword('爱情'))[0];
  const sq = await eng.supplementFor(aq);
  const ok4 = sq && sq.part_of_speech && sq.part_of_speech.indexOf('danh từ') >= 0 && sq.examples && sq.examples.length >= 1 && sq.examples[0].zh && sq.examples[0].vi && sq.hsk_level;
  console.log(`${ok4 ? 'PASS' : 'FAIL'}  爱情: loại từ + ví dụ + HSK  → ${sq && sq.part_of_speech} | HSK ${sq && sq.hsk_level} | ${sq && sq.examples && sq.examples[0].zh}`); ok4 ? pass++ : fail++;
  const fl = (await eng.lookupHeadword('法律'))[0];
  const sf = await eng.supplementFor(fl);
  const ok5 = sf && sf.examples && sf.examples.length >= 1 && !sf.part_of_speech;   // HSK4: có ví dụ, nguồn không có loại từ → không được bịa
  console.log(`${ok5 ? 'PASS' : 'FAIL'}  法律 (HSK4): có ví dụ, KHÔNG bịa loại từ  → HSK ${sf && sf.hsk_level}`); ok5 ? pass++ : fail++;
  const noData = (await eng.lookupHeadword('蝴蝶'))[0];
  const sn = noData ? await eng.supplementFor(noData) : 'x';
  const ok6 = noData && sn === null;
  console.log(`${ok6 ? 'PASS' : 'FAIL'}  từ ngoài các danh sách HSK (蝴蝶): không có dữ liệu bổ sung, không lỗi`); ok6 ? pass++ : fail++;
  const batch = await eng.supplementsFor([aq, fl, noData]);
  const ok7 = !!batch[aq.id] && !!batch[fl.id] && !batch[noData.id];
  console.log(`${ok7 ? 'PASS' : 'FAIL'}  supplementsFor nhiều mục cùng lúc`); ok7 ? pass++ : fail++;
  console.log(`\nKết quả: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})();
