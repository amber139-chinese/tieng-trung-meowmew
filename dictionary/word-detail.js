/*
 * Meow Meow Dictionary - trang chi tiết một từ.
 * Chỉ hiển thị trường nào thật sự có dữ liệu. Dữ liệu biên soạn riêng (supplements) được gắn nhãn riêng.
 */
(function (root) {
  'use strict';

  function speak(text) {
    try {
      var synth = root.speechSynthesis;
      if (!synth) return false;
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.85;
      synth.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function canSpeak() { return !!(root.speechSynthesis && root.SpeechSynthesisUtterance); }

  function section(h, title, node) { var s = h('div', {}, [h('h3', { text: title }), node]); return s; }
  function nonEmpty(a) { return Array.isArray(a) && a.some(Boolean); }

  function renderSupplement(h, sp, go) {
    var box = h('div', { class: 'mm-block' });
    var t = h('div', { class: 'mm-title' }, [h('span', { class: 'tag mm', text: 'Meow Meow biên soạn' })]);
    if (sp.verified === false) t.appendChild(h('span', { class: 'unver', text: 'chưa xác minh' }));
    box.appendChild(t);
    if (sp.han_viet) box.appendChild(section(h, 'Âm Hán Việt', h('div', { text: sp.han_viet })));
    if (nonEmpty(sp.part_of_speech)) box.appendChild(section(h, 'Từ loại', h('div', { text: sp.part_of_speech.join(' · ') })));
    if (nonEmpty(sp.meanings)) box.appendChild(section(h, 'Nghĩa', h('ol', {}, sp.meanings.map(function (m) { return h('li', { text: m }); }))));
    if (nonEmpty(sp.examples)) {
      box.appendChild(section(h, 'Ví dụ', h('div', {}, sp.examples.map(function (ex) {
        var d = h('div', { class: 'ex' }, [h('div', { class: 'zh', text: ex.zh || '' })]);
        if (ex.pinyin) d.appendChild(h('div', { class: 'vi', text: ex.pinyin }));
        if (ex.vi) d.appendChild(h('div', { class: 'vi', text: ex.vi }));
        return d;
      }))));
    }
    [['synonyms', 'Từ đồng nghĩa'], ['antonyms', 'Từ trái nghĩa'], ['related_words', 'Từ liên quan']].forEach(function (p) {
      if (nonEmpty(sp[p[0]])) {
        box.appendChild(section(h, p[1], h('div', { class: 'chips' }, sp[p[0]].filter(Boolean).map(function (w) {
          return h('button', { class: 'chip zh', type: 'button', text: w, onclick: function () { go(w); } });
        }))));
      }
    });
    if (sp.hsk_level) box.appendChild(section(h, 'Cấp độ HSK', h('div', { text: String(sp.hsk_level) })));
    if (sp.usage_notes) box.appendChild(section(h, 'Ghi chú cách dùng', h('div', { text: sp.usage_notes })));
    if (sp.source) box.appendChild(h('div', { class: 'src', text: 'Nguồn: ' + sp.source + (sp.updated_at ? ' · cập nhật ' + sp.updated_at : '') }));
    return box;
  }

  /* h = hàm tạo phần tử, go(word) = mở trang chi tiết của một từ khác */
  function render(engine, word, el, h, go) {
    el.textContent = '';
    return engine.lookupHeadword(word).then(function (entries) {
      if (!entries.length) {
        el.appendChild(h('div', { class: 'empty' }, [h('b', { text: 'Không tìm thấy mục từ “' + word + '”' }), h('span', { text: 'Hãy thử tra lại bằng ô tìm kiếm.' })]));
        return null;
      }
      var first = entries[0], simp = first.s, trad = first.t;
      var head = h('div', { class: 'word-head' }, [h('div', { class: 'big', lang: 'zh-Hans', text: simp })]);
      if (trad && trad !== simp) head.appendChild(h('div', { class: 'trad' }, [h('span', { text: 'Phồn thể' }), h('span', { lang: 'zh-Hant', text: trad })]));
      el.appendChild(head);

      return Promise.all(entries.map(function (e) { return engine.supplementFor(e); })).then(function (supps) {
        entries.forEach(function (e, i) {
          var rh = h('div', { class: 'rh' }, [h('span', { class: 'rpy', text: e.d || e.p })]);
          if (canSpeak()) rh.appendChild(h('button', { class: 'speak', type: 'button', 'aria-label': 'Phát âm ' + e.s, text: '🔊 Phát âm', onclick: function () { speak(e.s); } }));
          var card = h('article', { class: 'reading' }, [rh]);
          if (entries.length > 1 && e.t && e.t !== e.s) card.appendChild(h('div', { class: 'src', text: 'Phồn thể: ' + e.t }));
          card.appendChild(section(h, 'Nghĩa', h('ol', {}, e.m.map(function (m) { return h('li', { text: m }); }))));
          if (e.lt && e.lt.length) card.appendChild(section(h, 'Lượng từ', h('div', { text: e.lt.join(' · ') })));
          if (supps[i]) card.appendChild(renderSupplement(h, supps[i], go));
          el.appendChild(card);
        });
        return engine.startsWith(simp, 14).then(function (rel) {
          if (!rel.length) return null;
          var box = h('div', { class: 'related' }, [h('h2', { text: 'Từ bắt đầu bằng ' + simp })]);
          var chips = h('div', { class: 'chips' });
          rel.forEach(function (r) {
            chips.appendChild(h('button', { class: 'chip zh', type: 'button', title: r.m[0], text: r.s, onclick: function () { go(r.s); } }));
          });
          box.appendChild(chips); el.appendChild(box);
          return null;
        }).catch(function () { return null; });       // lỗi phần "liên quan" không được làm hỏng trang
      });
    });
  }

  root.MeowDictDetail = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
