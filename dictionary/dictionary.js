/*
 * Meow Meow Dictionary - giao diện trang /dictionary/.
 * Route:  ?q=<từ khoá>  → danh sách kết quả     ?w=<từ>  → trang chi tiết     (không tham số) → trang chủ
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 20, HKEY = 'meowdict.history', HMAX = 12;

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  var engine = MeowDictEngine.create({ load: MeowDictLoader.createLoader(), base: '../data/dictionary/' });
  var el = {
    form: $('searchForm'), q: $('q'), suggest: $('suggest'), status: $('status'),
    home: $('viewHome'), results: $('viewResults'), detail: $('viewDetail'),
    title: $('resultsTitle'), list: $('resultList'), more: $('moreBtn'), segs: $('segments'),
    hbox: $('historyBox'), hlist: $('historyList')
  };
  var state = { q: '', offset: 0, token: 0, sugToken: 0, sugTimer: null, sugItems: [], sugIndex: -1 };

  /* ---------- lịch sử ---------- */
  function getHistory() { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; } }
  function setHistory(a) { try { localStorage.setItem(HKEY, JSON.stringify(a.slice(0, HMAX))); } catch (e) { /* bỏ qua */ } }
  function pushHistory(text) {
    text = (text || '').trim(); if (!text) return;
    setHistory([text].concat(getHistory().filter(function (x) { return x !== text; })));
  }
  function renderHistory() {
    var hs = getHistory();
    el.hbox.hidden = !hs.length;
    el.hlist.textContent = '';
    hs.forEach(function (t) { el.hlist.appendChild(h('button', { class: 'chip' + (/[\u3400-\u9fff]/.test(t) ? ' zh' : ''), type: 'button', text: t, onclick: function () { runSearch(t); } })); });
  }

  /* ---------- trạng thái / điều hướng ---------- */
  function setStatus(msg, err, retry) {
    el.status.className = 'status' + (err ? ' err' : '');
    el.status.textContent = msg || '';
    if (retry) el.status.appendChild(h('button', { class: 'btn', type: 'button', text: 'Thử lại', onclick: retry }));
  }
  function show(view) {
    ['home', 'results', 'detail'].forEach(function (v) { el[v].hidden = v !== view; });
  }
  function url(params) {
    var s = new URLSearchParams(params).toString();
    return location.pathname + (s ? '?' + s : '');
  }
  function navigate(params, replace) {
    var u = url(params);
    if (u !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', u);
    route();
  }
  function failMsg(err) {
    return (navigator.onLine === false ? 'Bạn đang offline và dữ liệu cho từ này chưa được lưu trên máy. ' : 'Không tải được dữ liệu từ điển. ')
      + 'Kiểm tra kết nối rồi thử lại.';
  }

  /* ---------- kết quả ---------- */
  function cardFor(r, suppMap) {
    var e = r.entry, sp = suppMap[e.id];
    var hz = h('div', { class: 'hz', lang: 'zh-Hans', text: e.s });
    if (e.t && e.t !== e.s) hz.appendChild(h('small', { lang: 'zh-Hant', text: e.t }));
    var body = h('div', {}, [h('div', { class: 'py', text: e.d || e.p })]);
    var shown = (sp && sp.han_viet ? 'Hán Việt: ' + sp.han_viet + ' · ' : '') + e.m.slice(0, 3).join(' · ');
    body.appendChild(h('div', { class: 'mean', text: shown }));
    var meta = [];
    if (sp) meta.push(h('span', { class: 'tag mm', text: 'Meow Meow' }));
    if (sp && sp.hsk_level) meta.push(h('span', { class: 'tag', text: 'HSK ' + sp.hsk_level }));
    if (sp && sp.part_of_speech) sp.part_of_speech.slice(0, 3).forEach(function (p) { meta.push(h('span', { class: 'tag pos', text: p })); });
    if (meta.length) body.appendChild(h('div', { class: 'meta' }, meta));
    var a = h('a', { class: 'card', href: url({ w: e.s }), 'data-w': e.s }, [hz, body]);
    return a;
  }
  function appendResults(res) {
    return engine.supplementsFor(res.results.map(function (r) { return r.entry; })).then(function (sm) {
      res.results.forEach(function (r) { el.list.appendChild(cardFor(r, sm)); });
    });
  }
  function renderSegments(segs) {
    el.segs.textContent = '';
    if (!segs || !segs.length) { el.segs.hidden = true; return; }
    el.segs.hidden = false;
    el.segs.appendChild(h('h2', { text: 'Không có mục khớp cả cụm — các từ tìm thấy trong câu' }));
    var wrap = h('div', { class: 'chips' });
    segs.forEach(function (s) { wrap.appendChild(h('button', { class: 'chip zh', type: 'button', title: (s.entry.d || s.entry.p) + ' · ' + s.entry.m[0], text: s.word, onclick: function () { navigate({ w: s.word }); } })); });
    el.segs.appendChild(wrap);
  }

  function runSearch(q) { hideSuggest(); el.q.value = q; navigate({ q: q }); }

  function showResults(q) {
    var tok = ++state.token;
    state.q = q; state.offset = 0;
    show('results'); el.list.textContent = ''; el.segs.hidden = true; el.more.hidden = true;
    el.title.textContent = ''; setStatus('Đang tìm…');
    return engine.search(q, { limit: PAGE, offset: 0 }).then(function (res) {
      if (tok !== state.token) return;
      setStatus('');
      el.title.textContent = '';
      el.title.appendChild(document.createTextNode('Kết quả cho '));
      el.title.appendChild(h('b', { text: '“' + q + '”' }));
      if (res.total) el.title.appendChild(document.createTextNode(' · ' + (res.hasMore ? 'hiển thị ' + res.results.length + '+' : res.total) + ' mục'));
      pushHistory(q); renderHistory();
      renderSegments(res.segments);
      if (!res.results.length) {
        if (!res.segments.length) el.list.appendChild(h('div', { class: 'empty' }, [h('b', { text: 'Không tìm thấy kết quả' }), h('span', { text: 'Thử viết pinyin không dấu (xuexi), chữ Hán, hoặc một từ tiếng Việt ngắn hơn.' })]));
        return;
      }
      state.offset = res.results.length;
      el.more.hidden = !res.hasMore;
      return appendResults(res);
    }).catch(function (err) {
      if (tok !== state.token) return;
      setStatus(failMsg(err), true, function () { showResults(q); });
    });
  }
  function loadMore() {
    var tok = state.token; el.more.disabled = true;
    engine.search(state.q, { limit: PAGE, offset: state.offset }).then(function (res) {
      if (tok !== state.token) return;
      state.offset += res.results.length; el.more.hidden = !res.hasMore;
      return appendResults(res);
    }).catch(function (err) { setStatus(failMsg(err), true); }).then(function () { el.more.disabled = false; });
  }

  /* ---------- chi tiết ---------- */
  function showDetail(word) {
    var tok = ++state.token;
    show('detail'); el.detail.textContent = ''; setStatus('Đang tải…');
    var back = h('button', { class: 'back', type: 'button', text: '← Quay lại', onclick: function () {
      if (history.length > 1 && document.referrer.indexOf(location.host) >= 0) history.back(); else navigate({}); } });
    return MeowDictDetail.render(engine, word, el.detail, h, function (w) { navigate({ w: w }); }).then(function (ok) {
      if (tok !== state.token) return;
      setStatus(''); el.detail.insertBefore(back, el.detail.firstChild);
      if (ok !== null) { /* không có mục: render đã báo */ }
      pushHistory(word); renderHistory();
      document.title = word + ' – 猫猫词典 Meow Meow Dictionary';
    }).catch(function (err) {
      if (tok !== state.token) return;
      el.detail.textContent = '';
      setStatus(failMsg(err), true, function () { showDetail(word); });
    });
  }

  function route() {
    var p = new URLSearchParams(location.search);
    document.title = '猫猫词典 – Meow Meow Dictionary | Từ điển Trung – Việt | Tiếng Trung Meow Meow';
    hideSuggest();
    if (p.get('w')) { el.q.value = ''; return showDetail(p.get('w')); }
    if (p.get('q') && p.get('q').trim()) { el.q.value = p.get('q'); return showResults(p.get('q').trim()); }
    state.token++; setStatus(''); show('home'); renderHistory(); return null;
  }

  /* ---------- gợi ý khi gõ ---------- */
  function hideSuggest() { state.sugToken++; clearTimeout(state.sugTimer); el.suggest.hidden = true; el.suggest.textContent = ''; el.q.setAttribute('aria-expanded', 'false'); state.sugItems = []; state.sugIndex = -1; }
  function markSelected() {
    Array.prototype.forEach.call(el.suggest.children, function (li, i) { li.setAttribute('aria-selected', i === state.sugIndex ? 'true' : 'false'); });
  }
  function suggest(q) {
    var tok = ++state.sugToken;
    if (!q.trim()) return hideSuggest();
    engine.search(q.trim(), { limit: 6 }).then(function (res) {
      if (tok !== state.sugToken || !res.results.length) { if (tok === state.sugToken) hideSuggest(); return; }
      el.suggest.textContent = ''; state.sugItems = res.results.map(function (r) { return r.entry.s; }); state.sugIndex = -1;
      res.results.forEach(function (r) {
        var e = r.entry;
        var li = h('li', { role: 'option' }, [h('span', { class: 's-hz', lang: 'zh-Hans', text: e.s }), h('span', { class: 's-py', text: e.d || e.p }), h('span', { class: 's-m', text: e.m[0] })]);
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); hideSuggest(); navigate({ w: e.s }); });
        el.suggest.appendChild(li);
      });
      el.suggest.hidden = false; el.q.setAttribute('aria-expanded', 'true');
    }).catch(function () { if (tok === state.sugToken) hideSuggest(); });   // gợi ý lỗi thì im lặng, tra chính vẫn chạy
  }

  /* ---------- sự kiện ---------- */
  el.form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (state.sugIndex >= 0 && state.sugItems[state.sugIndex]) { var w = state.sugItems[state.sugIndex]; hideSuggest(); return navigate({ w: w }); }
    var q = el.q.value.trim(); if (q) runSearch(q);
  });
  el.q.addEventListener('input', function () { clearTimeout(state.sugTimer); state.sugTimer = setTimeout(function () { suggest(el.q.value); }, 160); });
  el.q.addEventListener('keydown', function (ev) {
    if (el.suggest.hidden) return;
    var n = state.sugItems.length;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); state.sugIndex = (state.sugIndex + 1) % n; markSelected(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); state.sugIndex = (state.sugIndex - 1 + n) % n; markSelected(); }
    else if (ev.key === 'Escape') hideSuggest();
  });
  el.q.addEventListener('blur', function () { setTimeout(hideSuggest, 120); });
  el.more.addEventListener('click', loadMore);
  $('clearHistory').addEventListener('click', function () { setHistory([]); renderHistory(); });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.ex[data-q]');
    if (b) { ev.preventDefault(); return runSearch(b.getAttribute('data-q')); }
    var a = ev.target.closest && ev.target.closest('a[data-w]');
    if (a && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && ev.button === 0) { ev.preventDefault(); navigate({ w: a.getAttribute('data-w') }); }
  });
  window.addEventListener('popstate', route);

  route();
})();
