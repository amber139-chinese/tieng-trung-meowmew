/*
 * Meow Meow Dictionary - bộ máy tìm kiếm.
 * Chạy được cả trên trình duyệt (window.MeowDictEngine) lẫn Node (module.exports) để kiểm thử.
 *
 * Dữ liệu (xem scripts/build-dictionary.py):
 *   index.json                manifest + danh sách shard của từng chỉ mục
 *   entries/e-NNN.json        mục từ, 1000 mục / file, id = vị trí toàn cục
 *   han/ py/ vm/ vi/          chỉ mục "khoá -> danh sách id", chia shard theo khoảng khoá đã sắp xếp
 *       han = chữ Hán (giản thể + phồn thể)      py = pinyin bỏ dấu, bỏ cách
 *       vm  = cụm nghĩa tiếng Việt (nguyên cụm)  vi = từng từ tiếng Việt trong nghĩa
 *
 * Chỉ tải những shard thật sự cần cho câu tra hiện tại.
 */
(function (root) {
  'use strict';

  /* ---------- chuẩn hoá chuỗi ---------- */
  var TONE_BASE = {};
  (function () {
    var T = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
    for (var b in T) for (var i = 0; i < 4; i++) TONE_BASE[T[b].charAt(i)] = [b, i + 1];
  })();
  var TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };

  function stripMarks(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function toneless(s) { return stripMarks(s).toLowerCase().replace(/[^a-z]/g, ''); }
  function stripVN(s) { return stripMarks(s.replace(/đ/g, 'd').replace(/Đ/g, 'D')).toLowerCase(); }
  function vnTokens(s) { return stripVN(s).match(/[a-z0-9]+/g) || []; }

  function addTone(syl, tone) {
    if (tone < 1 || tone > 4) return syl;
    var low = syl.toLowerCase(), idx = -1, i;
    if ((i = low.indexOf('a')) >= 0) idx = i;
    else if ((i = low.indexOf('e')) >= 0) idx = i;
    else if ((i = low.indexOf('ou')) >= 0) idx = i;
    else { for (i = low.length - 1; i >= 0; i--) { if ('aeiouü'.indexOf(low.charAt(i)) >= 0) { idx = i; break; } } }
    if (idx < 0) return syl;
    return syl.slice(0, idx) + TONES[low.charAt(idx)].charAt(tone - 1) + syl.slice(idx + 1);
  }

  var HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[\ud840-\ud87f][\udc00-\udfff]/;
  var PINYIN_ONLY = /^[a-zü1-5\s'\-āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/;

  /* Hiểu một câu gõ có thể là pinyin: trả về {key: 'xuexi', mask: 'xuéxí'} hoặc null.
   * mask giữ lại những dấu thanh người dùng đã gõ (dấu hoặc số), dùng để lọc kết quả. */
  function parsePinyinQuery(q) {
    var s = q.normalize('NFC').toLowerCase().replace(/u:/g, 'ü');
    if (!PINYIN_ONLY.test(s)) return null;
    s = s.replace(/v/g, 'ü');
    var mask;
    if (/[1-5]/.test(s)) {
      mask = '';
      s.replace(/[\s'\-]+/g, ' ').split(' ').forEach(function (part) {
        part.replace(/([a-zü]+)([1-5])?/g, function (_, syl, t) { mask += t ? addTone(syl, +t) : syl; return ''; });
      });
    } else {
      mask = s.replace(/[\s'\-]+/g, '');
    }
    var key = toneless(mask);
    return key ? { key: key, mask: mask } : null;
  }

  function hasToneInfo(mask) { for (var i = 0; i < mask.length; i++) if (TONE_BASE[mask.charAt(i)]) return true; return false; }

  /* mask (phần người dùng gõ) khớp với pinyin đầy đủ của mục từ? prefix = cho phép gõ dở */
  function maskMatchesStr(mask, joined, prefix) {
    if (!prefix && joined.length !== mask.length) return false;
    if (joined.length < mask.length) return false;
    for (var i = 0; i < mask.length; i++) {
      var c = mask.charAt(i);
      if (TONE_BASE[c] && joined.charAt(i) !== c) return false;
    }
    return true;
  }

  function maskMatches(mask, entry, prefix) {
    return maskMatchesStr(mask, entry.p.normalize('NFC').toLowerCase().replace(/[^a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, ''), prefix);
  }

  /* ---------- engine ---------- */
  function create(opts) {
    var load = opts.load;                       // function(relativePath) -> Promise<json>
    var BASE = opts.base || 'data/dictionary/';
    var manifest = null, memo = {};
    var CAND_MAX = opts.candidateMax || 300;

    function getJSON(rel) {
      if (!memo[rel]) memo[rel] = load(BASE + rel).catch(function (e) { delete memo[rel]; throw e; });
      return memo[rel];
    }
    function init() {
      if (!manifest) manifest = getJSON('index.json').then(function (m) { manifest = m; return m; }, function (e) { manifest = null; throw e; });
      return Promise.resolve(manifest);
    }
    function ready() { return init().then(function (m) { return m; }); }

    /* ---- chỉ mục ---- */
    function shardFor(name, key) {
      var arr = manifest.indexes[name].shards, lo = 0, hi = arr.length - 1, ans = 0;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (arr[mid][0] <= key) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
      return ans;
    }
    function loadRows(name, i) { return getJSON(name + '/' + manifest.indexes[name].shards[i][1]); }
    function lowerBound(rows, key) {
      var lo = 0, hi = rows.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (rows[mid][0] < key) lo = mid + 1; else hi = mid; }
      return lo;
    }
    function decode(row) {
      var d = row[1], ids = [d[0]];
      for (var j = 1; j < d.length; j++) ids.push(ids[j - 1] + d[j]);
      if (row[2]) ids.acc = row[2];                       // chỉ mục pinyin: pinyin có dấu của từng id (để lọc theo dấu thanh)
      return ids;
    }
    function exact(name, key) {
      return ready().then(function () {
        return loadRows(name, shardFor(name, key)).then(function (rows) {
          var p = lowerBound(rows, key);
          return (p < rows.length && rows[p][0] === key) ? decode(rows[p]) : [];
        });
      });
    }
    /* các khoá bắt đầu bằng pref: trả về [{key, ids}] (tối đa maxKeys khoá) */
    function prefix(name, pref, maxKeys) {
      return ready().then(function () {
        var n = manifest.indexes[name].shards.length, out = [];
        function step(i) {
          if (i >= n) return out;
          return loadRows(name, i).then(function (rows) {
            var p = lowerBound(rows, pref);
            while (p < rows.length && rows[p][0].indexOf(pref) === 0) {
              var dec = decode(rows[p]); out.push({ key: rows[p][0], ids: dec, acc: dec.acc });
              if (out.length >= maxKeys) return out;
              p++;
            }
            return p < rows.length ? out : step(i + 1);
          });
        }
        return step(shardFor(name, pref));
      });
    }

    /* ---- mục từ ---- */
    function pad(n) { n = String(n); while (n.length < 3) n = '0' + n; return n; }
    function getEntries(ids) {
      return ready().then(function (m) {
        var need = {};
        ids.forEach(function (id) { need[Math.floor(id / m.entryShard)] = 1; });
        return Promise.all(Object.keys(need).map(function (n) {
          return getJSON('entries/e-' + pad(n) + '.json').then(function (arr) { return [+n, arr]; });
        })).then(function (pairs) {
          var shards = {}; pairs.forEach(function (p) { shards[p[0]] = p[1]; });
          var map = {};
          ids.forEach(function (id) {
            var s = shards[Math.floor(id / m.entryShard)], e = s && s[id % m.entryShard];
            if (e) { e.id = id; map[id] = e; }
          });
          return map;
        });
      });
    }

    /* Dữ liệu bổ sung (loại từ, ví dụ, HSK, Hán Việt...) nằm trong supp/s-NNN.json, mỗi file phục vụ suppSize mục từ.
     * Trả về {id: dữ liệu bổ sung}; mục nào không có thì không xuất hiện. Thiếu/lỗi file bổ sung không làm hỏng tra cứu. */
    function supplementsFor(entries) {
      return ready().then(function (m) {
        var size = m.suppSize || 1000, have = {}, need = {};
        (m.suppShards || []).forEach(function (n) { have[n] = 1; });
        entries.forEach(function (e) { var n = Math.floor(e.id / size); if (have[n]) need[n] = 1; });
        return Promise.all(Object.keys(need).map(function (n) {
          return getJSON('supp/s-' + pad(n) + '.json').catch(function () { return {}; });
        })).then(function (parts) {
          var all = {}, out = {};
          parts.forEach(function (part) { for (var k in part) all[k] = part[k]; });
          entries.forEach(function (e) { if (all[e.id]) out[e.id] = all[e.id]; });
          return out;
        });
      });
    }
    function supplementFor(entry) { return supplementsFor([entry]).then(function (m) { return m[entry.id] || null; }); }

    /* ---- tra theo chữ Hán ---- */
    function hanSearch(q, add) {
      var key = q.replace(/\s+/g, '');
      return Promise.all([exact('han', key), prefix('han', key, 80)]).then(function (r) {
        add(r[0], 1000, 'han-exact');
        r[1].forEach(function (row, i) {
          if (row.key === key) return;
          add(row.ids, 700 - Math.min(300, (row.key.length - key.length) * 20) - Math.min(i, 100) * 0.1, 'han-prefix');
        });
        return r[0].length > 0;
      });
    }
    /* Không có mục đúng cả cụm: tách thành các từ dài nhất tìm được, từ trái sang phải */
    function segment(text) {
      var chars = Array.from(text.replace(/\s+/g, '')), i = 0, out = [];
      function next() {
        if (i >= chars.length || out.length >= 12) return Promise.resolve(out);
        function tryLen(l) {
          if (l < 1) { i += 1; return next(); }
          var w = chars.slice(i, i + l).join('');
          return exact('han', w).then(function (ids) {
            if (ids.length) { out.push({ word: w, id: ids[0] }); i += l; return next(); }
            return tryLen(l - 1);
          });
        }
        return tryLen(Math.min(8, chars.length - i));
      }
      return next();
    }

    /* ---- tra theo pinyin ---- */
    function pinyinSearch(py, add) {
      return Promise.all([exact('py', py.key), py.key.length >= 2 ? prefix('py', py.key, 120) : Promise.resolve([])]).then(function (r) {
        add(r[0], 900, 'py-exact', py.mask, r[0].acc);
        r[1].forEach(function (row, i) {
          if (row.key === py.key) return;
          add(row.ids, 500 - Math.min(200, (row.key.length - py.key.length) * 15) - Math.min(i, 100) * 0.1, 'py-prefix', py.mask, row.acc);
        });
      });
    }

    /* ---- tra theo nghĩa tiếng Việt ---- */
    function intersect(a, b) {
      var out = [], i = 0, j = 0;
      while (i < a.length && j < b.length) { if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (a[i] < b[j]) i++; else j++; }
      return out;
    }
    function union(lists) {
      var seen = {}, out = [];
      lists.forEach(function (l) { l.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } }); });
      return out.sort(function (a, b) { return a - b; });
    }
    function tokenPostings(tok, isLast) {
      return exact('vi', tok).then(function (ids) {
        if (ids.length || !isLast || tok.length < 2) return ids;
        return prefix('vi', tok, 25).then(function (rows) { return union(rows.map(function (r) { return r.ids; })); });
      });
    }
    function vietSearch(q, add) {
      var toks = vnTokens(q);
      if (!toks.length) return Promise.resolve();
      var phrase = toks.join(' ');
      // cụm người dùng gõ giữ nguyên dấu: kết quả khớp ĐÚNG dấu (mèo) được xếp trên kết quả chỉ khớp khi bỏ dấu (meo, mẹo, méo)
      var qAcc = (q.normalize('NFC').toLowerCase().match(/[0-9a-z\u00c0-\u024f\u1e00-\u1eff]+/g) || []).join(' ');
      var accented = qAcc !== phrase;
      var jobs = [exact('vm', phrase), prefix('vm', phrase, 60)];
      toks.forEach(function (t, i) { jobs.push(tokenPostings(t, i === toks.length - 1)); });
      return Promise.all(jobs).then(function (r) {
        var exactIds = r[0], accs = exactIds.acc || [];
        exactIds.forEach(function (id, i) {
          var hit = !accented || (accs[i] || '').split('|').indexOf(qAcc) >= 0;
          add([id], hit ? 900 : 700, 'vm-exact');
        });
        r[1].forEach(function (row, i) {
          if (row.key === phrase) return;
          var base = 600 - Math.min(200, (row.key.length - phrase.length) * 4) - Math.min(i, 100) * 0.1;
          row.ids.forEach(function (id, j) {
            var hit = accented && (row.acc && row.acc[j] || '').split('|').some(function (a) { return a.indexOf(qAcc) === 0; });
            add([id], base + (hit ? 60 : 0), 'vm-prefix');
          });
        });
        var lists = r.slice(2), both = lists[0];
        for (var k = 1; k < lists.length; k++) both = intersect(both, lists[k]);
        add(both.slice(0, 400), 300, 'vi-all');
        if (toks.length > 1) {                          // không đủ mọi từ: cho các mục khớp một phần, xếp thấp hơn
          var count = {};
          lists.forEach(function (l) { l.slice(0, 2000).forEach(function (id) { count[id] = (count[id] || 0) + 1; }); });
          var part = Object.keys(count).filter(function (id) { return count[id] < toks.length; });
          part.sort(function (a, b) { return (count[b] - count[a]) || (a - b); });
          part.slice(0, 200).forEach(function (id) { add([+id], 100 + 40 * count[id], 'vi-part'); });
        }
      });
    }

    /* ---- API chính ---- */
    function search(query, o) {
      o = o || {};
      var limit = o.limit || 20, offset = o.offset || 0;
      var q = (query || '').normalize('NFC').trim();
      if (!q) return Promise.resolve({ query: q, results: [], total: 0, hasMore: false, segments: [] });
      return ready().then(function () {
        var cand = {};
        function add(ids, score, why, mask, accs) {
          for (var i = 0; i < ids.length; i++) {
            var id = ids[i], c = cand[id];
            // id nhỏ = từ ngắn hơn: cộng nhẹ để từ ngắn lên trước khi cùng điểm
            var sc = score - Math.min(i, 400) * 0.01;
            if (!c || c.score < sc) cand[id] = { score: sc, why: why, mask: mask || null, acc: accs ? accs[i] : null };
          }
        }
        var han = HAN_RE.test(q), jobs = [], gotExact = false;
        if (han) {
          jobs.push(hanSearch(q, add).then(function (ok) { gotExact = ok; }));
        } else {
          var py = parsePinyinQuery(q);
          if (py) jobs.push(pinyinSearch(py, add));
          jobs.push(vietSearch(q, add));
        }
        return Promise.all(jobs).then(function () {
          var ids = Object.keys(cand).map(Number).sort(function (a, b) { return (cand[b].score - cand[a].score) || (a - b); });
          var kept = [];
          for (var i = 0; i < ids.length && kept.length < CAND_MAX + offset; i++) {
            var c = cand[ids[i]];
            // lọc theo dấu/số thanh người dùng gõ, làm ngay trong chỉ mục pinyin nên không phải tải mục từ
            if (c.mask && c.acc && hasToneInfo(c.mask) && !maskMatchesStr(c.mask, c.acc, c.why === 'py-prefix')) continue;
            kept.push(ids[i]);
          }
          var pageIds = kept.slice(offset, offset + limit);
          return getEntries(pageIds).then(function (map) {
            var page = pageIds.map(function (id) { return map[id] ? { entry: map[id], score: cand[id].score, why: cand[id].why } : null; }).filter(Boolean);
            var out = { query: q, results: page, total: kept.length, hasMore: kept.length > offset + limit, segments: [] };
            if (han && !gotExact && Array.from(q.replace(/\s+/g, '')).length > 1 && offset === 0) {
              return segment(q).then(function (segs) {
                return getEntries(segs.map(function (x) { return x.id; })).then(function (m2) {
                  out.segments = segs.map(function (x) { return { word: x.word, entry: m2[x.id] }; }).filter(function (x) { return x.entry; });
                  return out;
                });
              });
            }
            return out;
          });
        });
      });
    }

    /* tất cả các cách đọc của một từ (giản thể hoặc phồn thể) */
    function lookupHeadword(word) {
      return exact('han', word).then(function (ids) {
        return getEntries(ids).then(function (map) { return ids.map(function (id) { return map[id]; }).filter(Boolean); });
      });
    }
    /* các từ bắt đầu bằng từ này (từ ghép liên quan, tính từ dữ liệu thật) */
    function startsWith(word, limit) {
      return prefix('han', word, 200).then(function (rows) {
        var seen = {}, ids = [];
        rows.filter(function (r) { return r.key !== word && r.key.length > word.length; })
          .sort(function (a, b) { return a.key.length - b.key.length || (a.key < b.key ? -1 : 1); })
          .forEach(function (r) { var id = r.ids[0]; if (!seen[id] && ids.length < (limit || 12)) { seen[id] = 1; ids.push(id); } });
        return getEntries(ids).then(function (map) { return ids.map(function (id) { return map[id]; }).filter(Boolean); });
      });
    }

    return {
      init: init, search: search, lookupHeadword: lookupHeadword, startsWith: startsWith,
      supplementFor: supplementFor, supplementsFor: supplementsFor, getEntries: getEntries,
      meta: function () { return manifest; }
    };
  }

  var api = {
    create: create, parsePinyinQuery: parsePinyinQuery, toneless: toneless, stripVN: stripVN, vnTokens: vnTokens,
    maskMatches: maskMatches, addTone: addTone
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MeowDictEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
