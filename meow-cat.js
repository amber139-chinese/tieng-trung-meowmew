/*!
 * meow-cat.js — Mèo giữ chuỗi của Tiếng Trung Meow Meow  (bản thiết kế lại v2)
 *
 * - Popup khi học viên mở web (1 lần / phiên / ngày) cho biết đã giữ chuỗi chưa.
 * - Luôn có một chú mèo nhỏ ở góc trái dưới của MỌI trang (vòng tiến độ tới món quà kế tiếp); bấm vào để mở lại.
 * - Học viên TỰ ĐẶT TÊN cho mèo (đồng bộ theo tài khoản).
 * - Tủ đồ: giữ chuỗi tới các mốc 10 · 20 · 30 · 40 · 50 · 60 · 70 · 100 · 150 · 200 · 250 · 300 ngày
 *   để mở mũ / giày / trang phục / phụ kiện cho mèo. Quà tính theo KỶ LỤC chuỗi nên đứt chuỗi cũng không mất quà.
 * - Chuỗi tính theo ngày (giờ máy học viên): mở web mỗi ngày = giữ chuỗi.
 * - Thẻ đóng băng ❄: học đủ 7 ngày liên tiếp nhận 1 thẻ (tối đa 2). Vắng ngày nào thì tự dùng thẻ để cứu chuỗi.
 * - Cá 🐟: làm đúng từ vựng (+1/câu) hoặc làm bài tập (tối đa +5/phần) để kiếm cá, rồi cho mèo ăn.
 *   Trang khác muốn tặng cá thì gọi:  MeowCat.correct('khoa-duy-nhat')  hoặc  MeowCat.reward('ten-bai', diemPhanTram)
 * - Nhắc qua email: học viên tự nhập email thật trong popup (cần chạy tao-bang-streak.sql + deploy
 *   supabase/functions/streak-reminder).
 * - Lưu localStorage theo tài khoản; nếu đã chạy tao-bang-streak.sql thì đồng bộ lên Supabase.
 *   Tên mèo + đồ đang mặc được lưu chung trong cột fish_state (jsonb) nên KHÔNG cần đổi cấu trúc bảng.
 *
 * Gắn vào trang:  <script defer src="meow-cat.js"></script>
 * Trang không đăng nhập (vd index.html):  <script defer src="meow-cat.js" data-standalone></script>
 */
(function () {
  'use strict';

  if (window.__meowCatLoaded) return;
  window.__meowCatLoaded = true;
  if (window.top !== window) return; // không hiện trong iframe

  /* ====== CẤU HÌNH ====== */
  var CAT = {
    name: 'Meow Meow', // tên mặc định khi học viên chưa đặt tên
    zh: '福喵',         // tên chữ Hán
    py: 'Fú Māo'       // phiên âm
  };
  var NAME_MAX = 14;     // số ký tự tối đa của tên mèo
  var NAME_IDEAS = ['Phúc Phúc', 'Tài Tài', 'Bánh Bao', 'Mochi', 'Tiểu Hồng', 'Lucky'];
  var SUPABASE_URL = 'https://xmtvmwcjjqqzscmkdlwd.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_R5TEjUNB6lDTJuN4MNdhVQ_ANwIaKLP';
  var TABLE = 'user_streaks';
  var MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 200, 365];
  var FREEZE_EVERY = 7;   // học đủ bấy nhiêu ngày liên tiếp thì nhận 1 thẻ đóng băng
  var MAX_FREEZES = 2;    // giữ tối đa bấy nhiêu thẻ cùng lúc
  var FISH_VOCAB_CAP = 15; // tối đa cá kiếm từ từ vựng mỗi ngày
  var FISH_EX_CAP = 30;    // tối đa cá kiếm từ bài tập mỗi ngày
  var FEED_CAP = 5;        // mèo ăn tối đa bấy nhiêu con cá mỗi ngày (no rồi thì mai ăn tiếp)
  var LEVELS = [[0, 'Mèo con'], [10, 'Mèo ngoan'], [30, 'Mèo béo'], [80, 'Mèo Thần Tài 财神']]; // [số cá đã ăn, danh hiệu]
  /* ===================== */

  var thisScript = document.currentScript;
  var STANDALONE = !!(thisScript && thisScript.hasAttribute('data-standalone'));

  /* ---------- ngày ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return fmt(new Date()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayDiff(a, b) { // số ngày từ a đến b
    var ua = Date.UTC.apply(null, [+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)]);
    var ub = Date.UTC.apply(null, [+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)]);
    return Math.round((ub - ua) / 86400000);
  }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }

  /* ---------- tài khoản ---------- */
  function sessionUid() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          var j = JSON.parse(localStorage.getItem(k));
          var u = j && (j.user || (j.currentSession && j.currentSession.user));
          if (u && u.id) return u.id;
        }
      }
    } catch (e) {}
    return null;
  }

  function authCtx() {
    return new Promise(function (resolve) {
      if (window.meowUser && window.meowSupabase) {
        return resolve({ uid: window.meowUser.id, client: window.meowSupabase });
      }
      var hasAuth = !STANDALONE && !!document.querySelector('script[src*="meow-auth.js"]');
      if (!hasAuth) return resolve({ uid: sessionUid(), client: null });
      var done = false;
      function fin(v) { if (!done) { done = true; resolve(v); } }
      window.addEventListener('meow-auth-ready', function (e) {
        fin({ uid: e.detail.user.id, client: e.detail.client });
      }, { once: true });
      setTimeout(function () { fin({ uid: sessionUid(), client: null }); }, 4000);
    });
  }

  function lazyClient() {
    return new Promise(function (resolve) {
      var t = setTimeout(function () { resolve(null); }, 5000);
      function make() {
        try { clearTimeout(t); resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)); }
        catch (e) { resolve(null); }
      }
      if (window.supabase) return make();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = make;
      s.onerror = function () { clearTimeout(t); resolve(null); };
      document.head.appendChild(s);
    });
  }

  /* ---------- lưu trữ ---------- */
  function storeKey(uid) { return 'meow_cat_streak_v1_' + (uid || 'guest'); }

  function norm(o) {
    return { last: o.last, count: o.count | 0, best: o.best | 0, freezes: o.freezes | 0, frozen: Array.isArray(o.frozen) ? o.frozen.slice(-30) : [] };
  }

  function readLocal(uid) {
    try {
      var o = JSON.parse(localStorage.getItem(storeKey(uid)));
      if (o && o.last) return norm(o);
    } catch (e) {}
    return null;
  }
  function writeLocal(uid, s) {
    try { localStorage.setItem(storeKey(uid), JSON.stringify(s)); } catch (e) {}
  }

  function fetchRemote(client, uid) {
    var timeout = new Promise(function (r) { setTimeout(function () { r(null); }, 3000); });
    var q = client.from(TABLE).select('current_streak,best_streak,last_day,freezes,frozen_days,reminder_email,reminder_on,fish_state')
      .eq('user_id', uid).maybeSingle().then(function (r) { return r; }, function () { return null; });
    return Promise.race([q, timeout]).then(function (r) {
      if (!r || r.error) return { ok: false, data: null, prefs: null, fish: null };
      var fishR = r.data && r.data.fish_state && r.data.fish_state.e ? normFish(r.data.fish_state) : null;
      var prefs = r.data ? { email: r.data.reminder_email || '', on: !!r.data.reminder_on } : { email: '', on: false };
      if (!r.data || !r.data.last_day) return { ok: true, data: null, prefs: prefs, fish: fishR };
      return { ok: true, prefs: prefs, fish: fishR, data: norm({ last: r.data.last_day, count: r.data.current_streak, best: r.data.best_streak,
        freezes: r.data.freezes, frozen: r.data.frozen_days }) };
    });
  }
  function saveRemote(client, uid, s) {
    return client.from(TABLE).upsert({
      user_id: uid,
      current_streak: s.count,
      best_streak: s.best,
      last_day: s.last,
      freezes: s.freezes,
      frozen_days: s.frozen,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).then(function () {}, function () {});
  }
  function saveEmailPrefs(email, on) {
    if (!ctx.client || !ctx.uid) return Promise.resolve(false);
    return ctx.client.from(TABLE).upsert({
      user_id: ctx.uid, reminder_email: email, reminder_on: on, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).then(function (r) { return !(r && r.error); }, function () { return false; });
  }

  /* ---------- logic chuỗi ---------- */
  function pick(a, b) {
    if (!a) return b;
    if (!b) return a;
    var best = Math.max(a.best, b.best), r;
    if (a.last > b.last) r = a;
    else if (a.last < b.last) r = b;
    else r = a.count >= b.count ? a : b;
    return { last: r.last, count: r.count, best: best, freezes: r.freezes, frozen: r.frozen };
  }

  function advance(s, t) {
    var out = s ? norm(s) : { last: null, count: 0, best: 0, freezes: 0, frozen: [] };
    var kind, prev = 0, used = 0, missed = 0, earned = false;
    if (!out.last || out.count <= 0) {
      out.count = 1; out.last = t; kind = 'first';
    } else {
      var d = dayDiff(out.last, t);
      if (d <= 0) { kind = 'same'; }
      else if (d === 1) { out.count += 1; kind = 'extended'; }
      else {
        missed = d - 1;
        if (out.freezes >= missed) {            // đủ thẻ: đóng băng các ngày vắng
          for (var i = 1; i <= missed; i++) out.frozen.push(addDays(out.last, i));
          out.freezes -= missed; used = missed; out.count += 1; kind = 'saved';
        } else { prev = out.count; out.count = 1; kind = 'reset'; }
      }
      if (kind !== 'same') out.last = t;
    }
    if ((kind === 'extended' || kind === 'saved') && out.count % FREEZE_EVERY === 0 && out.freezes < MAX_FREEZES) {
      out.freezes += 1; earned = true;
    }
    var cut = addDays(t, -30);
    out.frozen = out.frozen.filter(function (x) { return x >= cut; });
    out.best = Math.max(out.best, out.count);
    return { state: out, kind: kind, prev: prev, used: used, missed: missed, earned: earned };
  }

  function sameState(a, b) {
    return !!a && !!b && a.last === b.last && a.count === b.count && a.best === b.best &&
      a.freezes === b.freezes && JSON.stringify(a.frozen) === JSON.stringify(b.frozen);
  }

  /* ================================================================
   *  TỦ ĐỒ — 12 món quà theo mốc chuỗi (mũ · giày · trang phục · phụ kiện)
   * ================================================================ */
  var OL = '#6B4332', CREAM = '#FFF3E0', GOLD = '#F7C948', GOLD_D = '#8A5A00', RED = '#D7263D';
  var FZ = "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif";

  // --- hàm vẽ SVG nhỏ ---
  function S(w, c) { return ' stroke="' + (c || OL) + '" stroke-width="' + (w == null ? 3 : w) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function P(d, fill, w, c) { return '<path d="' + d + '" fill="' + fill + '"' + (w === 0 ? '' : S(w, c)) + '/>'; }
  function L(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function E(cx, cy, rx, ry, fill, w, c, tf) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (w === 0 ? '' : S(w, c)) + (tf ? ' transform="' + tf + '"' : '') + '/>';
  }
  function C(cx, cy, r, fill, w, c) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"' + (w === 0 ? '' : S(w, c)) + '/>'; }
  function TX(x, y, size, fill, ch) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="' + size + '" font-weight="700" fill="' + fill + '" font-family="' + FZ + '">' + ch + '</text>';
  }
  function star(cx, cy, r, fill) {
    return '<path d="M' + cx + ' ' + (cy - r) + 'Q' + cx + ' ' + cy + ' ' + (cx + r) + ' ' + cy + 'Q' + cx + ' ' + cy + ' ' + cx + ' ' + (cy + r) +
      'Q' + cx + ' ' + cy + ' ' + (cx - r) + ' ' + cy + 'Q' + cx + ' ' + cy + ' ' + cx + ' ' + (cy - r) + 'Z" fill="' + fill + '"/>';
  }
  function pair(inner) { return '<g>' + inner + '</g><g transform="matrix(-1 0 0 1 200 0)">' + inner + '</g>'; } // giày trái + phải (lật gương)

  // --- mũ (đội giữa hai tai) ---
  var HAT1 = // mũ len đỏ
    P('M63 56 Q62 18 100 14 Q138 18 137 56 Q100 46 63 56Z', RED) +
    P('M60 52 Q100 40 140 52 L141 66 Q100 54 59 66Z', '#B01C30') +
    L('M72 50 L72 62 M86 47.7 L86 59.7 M100 47 L100 59 M114 47.7 L114 59.7 M128 50 L128 62', '#8E1224', 2) +
    C(100, 12, 9, '#FFF8EE', 2.6);
  var HAT2 = // mũ Trạng Nguyên
    P('M72 38 L22 33 Q15 33 15 39 Q15 45 22 45 L72 49Z', '#2B2B3A', 2.5, GOLD_D) +
    P('M128 38 L178 33 Q185 33 185 39 Q185 45 178 45 L128 49Z', '#2B2B3A', 2.5, GOLD_D) +
    P('M70 56 L72 24 Q100 14 128 24 L130 56 Q100 46 70 56Z', '#2B2B3A', 3) +
    P('M70.5 49 Q100 39 129.5 49 L130 56 Q100 46 70 56Z', '#F2B632', 2, GOLD_D) +
    C(100, 32, 9, '#F2B632', 1.8, GOLD_D) + TX(100, 36.2, 11.5, '#C8102E', '福');
  var HAT3 = // vương miện vàng
    P('M64 56 L58 20 L80 36 L100 10 L120 36 L142 20 L136 56 Q100 46 64 56Z', GOLD, 3, GOLD_D) +
    P('M64.5 50 Q100 40 135.5 50 L136 56 Q100 46 64 56Z', '#E8A317', 1.5, GOLD_D) +
    C(100, 33, 5, RED, 1.6, GOLD_D) + C(80, 50.5, 3.2, '#2FA39A', 1.2, GOLD_D) + C(120, 50.5, 3.2, '#2FA39A', 1.2, GOLD_D) +
    C(58, 19, 3.4, '#FFF8EE', 1.6, GOLD_D) + C(100, 9, 4, '#FFF8EE', 1.6, GOLD_D) + C(142, 19, 3.4, '#FFF8EE', 1.6, GOLD_D);

  // --- giày (vẽ chiếc trái, chiếc phải lật gương) ---
  var SHOE = 'M60 212 Q60 200 78 200 Q96 200 96 212 L96 218 Q96 226 88 226 L68 226 Q60 226 60 218Z';
  var SOLE = 'M60 220 L96 220 L96 222 Q96 227 88 227 L68 227 Q60 227 60 222Z';
  var SHOE1 = pair(P(SHOE, RED) + P(SOLE, '#FFF8EE', 2) + L('M64 207 Q78 212 92 207', GOLD, 3) + E(70, 206, 4.5, 2.5, 'rgba(255,255,255,.4)', 0));
  var SHOE2 = pair(P(SHOE, '#2B2B3A') + P(SOLE, '#F2B632', 2, GOLD_D) + L('M62 209 Q78 215 94 209', '#F2B632', 3) + C(78, 219, 3, '#F2B632', 1.2, GOLD_D));
  var SHOE3 = pair(P('M60 208 Q46 198 40 206 Q48 207 51 211 Q43 212 42 219 Q52 218 60 217Z', '#FFF8EE', 2.5) +
    P(SHOE, GOLD) + P(SOLE, '#FFF8EE', 2) + L('M67 217 q4 -4 8 0 q4 -4 8 0', '#C48A00', 2) + C(78, 207, 4, RED, 1.5, GOLD_D));

  // --- trang phục ---
  var TORSO = 'M52 152 Q49 192 58 204 L142 204 Q151 192 148 152 Q100 122 52 152Z';
  function torso(fill, inner) { return P(TORSO, fill, 0) + inner + P(TORSO, 'none', 3); }
  var OUTFIT1 = // áo Đường trang đỏ
    torso(RED, P('M54.5 195 L145.5 195 L142 204 L58 204Z', '#F2B632', 0)) +
    E(60, 170, 12.5, 19, RED, 3, null, 'rotate(8 60 170)') + E(140, 170, 12.5, 19, RED, 3, null, 'rotate(-8 140 170)') +
    E(57.5, 186, 10, 3, '#F2B632', 0, null, 'rotate(8 57.5 186)') + E(142.5, 186, 10, 3, '#F2B632', 0, null, 'rotate(-8 142.5 186)') +
    L('M78 134 L100 166 L122 134', '#F2B632', 6.5) + C(100, 176, 3.6, '#F2B632', 1.2, GOLD_D) + C(100, 187, 3.6, '#F2B632', 1.2, GOLD_D);
  var OUTFIT2 = // Hán phục ngọc bích
    torso('#2FA39A', L('M121 134 L91 182 L89 204', '#1E7E76', 3)) +
    P('M51 176 Q100 188 149 176 L148 188 Q100 200 52 188Z', '#F26B6B', 2.5) +
    E(57, 172, 14.5, 21, '#2FA39A', 3, null, 'rotate(10 57 172)') + E(143, 172, 14.5, 21, '#2FA39A', 3, null, 'rotate(-10 143 172)') +
    E(53.5, 190, 12, 3.6, CREAM, 2.5, null, 'rotate(10 53.5 190)') + E(146.5, 190, 12, 3.6, CREAM, 2.5, null, 'rotate(-10 146.5 190)') +
    L('M79 133 L100 166 L121 133', CREAM, 7) +
    L('M99 190 L94 202 M101 190 L106 202', '#E5504F', 3.2) +
    E(92, 189.5, 7, 4.2, '#F26B6B', 2.2, null, 'rotate(-20 92 189.5)') + E(108, 189.5, 7, 4.2, '#F26B6B', 2.2, null, 'rotate(20 108 189.5)') + C(100, 188, 3.4, '#E5504F', 2);
  var WAVES = 'q6 -7 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0';
  var OUTFIT3 = // long bào hoàng kim
    torso(GOLD, L('M58 196 ' + WAVES, '#3B7DD8', 3) + L('M58 202 ' + WAVES, RED, 3)) +
    E(57, 172, 14.5, 21, GOLD, 3, null, 'rotate(10 57 172)') + E(143, 172, 14.5, 21, GOLD, 3, null, 'rotate(-10 143 172)') +
    E(53.5, 190, 12, 3.6, RED, 2.5, null, 'rotate(10 53.5 190)') + E(146.5, 190, 12, 3.6, RED, 2.5, null, 'rotate(-10 146.5 190)') +
    L('M78 134 L100 166 L122 134', RED, 7) +
    C(100, 172, 15, RED, 2.2, GOLD_D) + C(100, 172, 11, 'none', 1.2, GOLD) + TX(100, 177.4, 15, GOLD, '福');

  // --- phụ kiện ---
  var GLASSES =
    C(76, 96, 15.5, 'rgba(255,255,255,.22)', 3.4, '#2B1A17') + C(124, 96, 15.5, 'rgba(255,255,255,.22)', 3.4, '#2B1A17') +
    L('M91.5 94 Q100 88 108.5 94', '#2B1A17', 3.4) + L('M60.5 94 L47 90', '#2B1A17', 3.2) + L('M139.5 94 L153 90', '#2B1A17', 3.2) +
    L('M67 89 Q70 85.5 74 85', '#fff', 2) + L('M115 89 Q118 85.5 122 85', '#fff', 2);
  var BELL =
    P('M64 134 Q100 158 136 134 L134 145 Q100 170 66 145Z', RED, 2.5) +
    C(100, 162, 8, GOLD, 2, GOLD_D) + L('M92.5 163 h15', GOLD_D, 1.6) + C(100, 167, 1.7, GOLD_D, 0);
  var RAYS = (function () {
    var d = '';
    for (var i = 0; i < 14; i++) {
      var a = i * Math.PI * 2 / 14, c = Math.cos(a), s = Math.sin(a);
      d += 'M' + (100 + 88 * c).toFixed(1) + ' ' + (116 + 88 * s).toFixed(1) + 'L' + (100 + 99 * c).toFixed(1) + ' ' + (116 + 99 * s).toFixed(1);
    }
    return d;
  })();
  var HALO = '<g class="halo"><circle cx="100" cy="116" r="99" fill="#FFE08A" opacity=".3"/><circle cx="100" cy="116" r="82" fill="#FFD25E" opacity=".3"/>' +
    L(RAYS, GOLD, 3.5) + star(22, 40, 7, '#FFD25E') + star(180, 62, 6, '#FFD25E') + star(173, 196, 5, '#FFD25E') + star(26, 168, 5, '#FFD25E') + '</g>';
  var INGOT = // nguyên bảo 元宝
    P('M70 192 Q76 205 100 205 Q124 205 130 192 Q120 190 114 182 Q100 176 86 182 Q80 190 70 192Z', GOLD, 2.5, GOLD_D) +
    E(100, 183, 13, 5.5, '#FFE08A', 1.8, GOLD_D) + TX(100, 199, 9, '#C8102E', '元宝');

  var SLOTS = { h: 'Mũ', s: 'Giày', o: 'Trang phục', a: 'Phụ kiện' };
  var SLOT_ORDER = ['h', 's', 'o', 'a'];
  var VB = { h: '20 0 160 112', s: '38 190 124 42', o: '28 112 144 108', a: '0 0 200 232' };
  var ITEMS = [
    { id: 'h1', slot: 'h', day: 10,  name: 'Mũ len đỏ',           zh: '红毛线帽', py: 'hóng máoxiàn mào', svg: HAT1 },
    { id: 's1', slot: 's', day: 20,  name: 'Giày vải đỏ',         zh: '红布鞋',   py: 'hóng bùxié',        svg: SHOE1 },
    { id: 'o1', slot: 'o', day: 30,  name: 'Áo Đường trang',      zh: '唐装',     py: 'tángzhuāng',        svg: OUTFIT1 },
    { id: 'a1', slot: 'a', day: 40,  name: 'Kính tròn',           zh: '圆框眼镜', py: 'yuánkuàng yǎnjìng', svg: GLASSES, layer: 'post', vb: '30 56 140 84' },
    { id: 'h2', slot: 'h', day: 50,  name: 'Mũ Trạng Nguyên',     zh: '状元帽',   py: 'zhuàngyuán mào',    svg: HAT2, vb: '6 0 188 112' },
    { id: 's2', slot: 's', day: 60,  name: 'Giày thêu vàng',      zh: '金绣鞋',   py: 'jīn xiù xié',       svg: SHOE2 },
    { id: 'o2', slot: 'o', day: 70,  name: 'Hán phục ngọc bích',  zh: '汉服',     py: 'hànfú',             svg: OUTFIT2 },
    { id: 'a2', slot: 'a', day: 100, name: 'Chuông vàng may mắn', zh: '金铃铛',   py: 'jīn língdang',      svg: BELL, layer: 'pre', vb: '30 100 140 90' },
    { id: 'h3', slot: 'h', day: 150, name: 'Vương miện vàng',     zh: '金皇冠',   py: 'jīn huángguān',     svg: HAT3 },
    { id: 's3', slot: 's', day: 200, name: 'Giày mây cát tường',  zh: '祥云鞋',   py: 'xiángyún xié',      svg: SHOE3 },
    { id: 'o3', slot: 'o', day: 250, name: 'Long bào hoàng kim',  zh: '龙袍',     py: 'lóngpáo',           svg: OUTFIT3 },
    { id: 'a3', slot: 'a', day: 300, name: 'Hào quang Thần Tài',  zh: '财神光环', py: 'cáishén guānghuán', svg: INGOT, back: HALO, layer: 'pre', vb: '0 0 200 232' }
  ];
  var IDX = {};
  ITEMS.forEach(function (it) { IDX[it.id] = it; });
  function byId(id) { return Object.prototype.hasOwnProperty.call(IDX, id) ? IDX[id] : null; }

  /* ---------- hình mèo (SVG, xếp lớp) ---------- */
  var BASE_BACK =
    '<g class="tail">' + L('M140 198 C188 200 194 150 164 134', OL, 17) + L('M140 198 C188 200 194 150 164 134', CREAM, 11) + '</g>' +
    P('M48 76 Q42 34 52 24 Q57 19 63 23 L92 46Z', '#F2A65A') + P('M57 64 Q53 40 58 32 L79 47Z', '#F7A8B8', 0) +
    P('M152 76 Q158 34 148 24 Q143 19 137 23 L108 46Z', CREAM) + P('M143 64 Q147 40 142 32 L121 47Z', '#F7A8B8', 0) +
    P('M52 152 Q48 204 64 214 L136 214 Q152 204 148 152 Q100 122 52 152Z', CREAM, 0) +
    P('M118 150 Q148 152 148 180 Q140 192 128 178 Q120 166 118 150Z', '#4B3A35', 0) +
    E(100, 186, 25, 24, '#FFFAF1', 0) +
    P('M52 152 Q48 204 64 214 L136 214 Q152 204 148 152 Q100 122 52 152Z', 'none', 3) +
    E(62, 178, 11.5, 25, CREAM, 3, null, 'rotate(8 62 178)') + E(138, 178, 11.5, 25, CREAM, 3, null, 'rotate(-8 138 178)') +
    E(78, 215, 17, 9.5, CREAM, 3) + E(122, 215, 17, 9.5, CREAM, 3) +
    L('M73 216 v4 M81 216 v4 M119 216 v4 M127 216 v4', OL, 2);

  // mood: '' (mặc định: cười nhẹ) | 'happy' (vui, mắt cười) | 'sad' (buồn: đói hoặc mất chuỗi)
  function headSVG(mood) {
    var EYE_OPEN = E(76, 97, 7.5, 9, '#2B1A17', 0) + C(78.8, 93, 2.8, '#fff', 0) + C(73.6, 100.5, 1.3, '#fff', 0) +
        E(124, 97, 7.5, 9, '#2B1A17', 0) + C(126.8, 93, 2.8, '#fff', 0) + C(121.6, 100.5, 1.3, '#fff', 0);
    var eyes, mouth;
    if (mood === 'happy') {
      eyes = L('M66 100 Q76 87 86 100', '#2B1A17', 4) + L('M114 100 Q124 87 134 100', '#2B1A17', 4);
      mouth = P('M92 114 Q100 114 108 114 Q106 125 100 125 Q94 125 92 114Z', '#D64560', 2, '#4A2A22');
    } else if (mood === 'sad') {
      // mắt to long lanh, lông mày xệ, một giọt nước mắt, miệng cong xuống
      eyes = EYE_OPEN +
        L('M63 87 Q73 82 87 79', '#4A2A22', 2.6) + L('M137 87 Q127 82 113 79', '#4A2A22', 2.6) +
        P('M66 108 Q61.5 115 66 118.5 Q70.5 115 66 108Z', '#9AD1F5', 1.2, '#4A8DBF');
      mouth = L('M100 113.5 L100 117 M92 125 Q100 116.5 108 125', '#4A2A22', 2.4);
    } else {
      // mặc định: cười nhẹ kiểu mèo (chữ w hướng lên)
      eyes = EYE_OPEN;
      mouth = L('M100 113.5 L100 117 M100 117 Q95 124.5 88.5 116 M100 117 Q105 124.5 111.5 116', '#4A2A22', 2.4);
    }
    return E(100, 92, 58, 48, CREAM, 0) +
      P('M52 86 Q50 66 67 56 Q79 50 90 48 Q85 64 82 80 Q68 92 52 86Z', '#F2A65A', 0) +
      P('M146 80 Q148 66 134 57 Q124 52 116 50 Q120 64 122 76 Q134 86 146 80Z', '#4B3A35', 0) +
      E(100, 92, 58, 48, 'none', 3) +
      L('M100 53 v7 M92 55 v5 M108 55 v5', '#E8B07A', 2.4) +
      E(60, 109, 8, 6, 'rgba(255,140,160,.5)', 0) + E(140, 109, 8, 6, 'rgba(255,140,160,.5)', 0) +
      '<g class="eyes">' + eyes + '</g>' + mouth +
      P('M95.5 107 L104.5 107 Q104 111.5 100 113.5 Q96 111.5 95.5 107Z', '#E5758B', 1.5) +
      L('M46 104 L26 100 M46 111 L27 114 M154 104 L174 100 M154 111 L173 114', '#8B6A58', 2);
  }

  // view: 'full' | 'mini' | 'thumb' ; eq: {h,s,o,a} ; mood: '' | 'happy' ; vb: tuỳ chọn khung nhìn
  function catSVG(view, eq, mood, vb) {
    eq = eq || {};
    var h = byId(eq.h), sh = byId(eq.s), o = byId(eq.o), a = byId(eq.a);
    var box = vb || (view === 'mini' ? '28 0 144 144' : '0 0 200 232');
    var s = '<svg viewBox="' + box + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';
    if (a && a.back) s += a.back;
    s += BASE_BACK;
    if (sh) s += sh.svg;
    if (o) s += o.svg;
    if (a && a.layer === 'pre') s += a.svg;
    s += headSVG(mood);
    if (a && a.layer === 'post') s += a.svg;
    if (h) s += h.svg;
    return s + '</svg>';
  }
  function thumbSVG(it) {
    var eq = { h: '', s: '', o: '', a: '' }; eq[it.slot] = it.id;
    return catSVG('thumb', eq, '', it.vb || VB[it.slot]);
  }

  /* ---------- cá 🐟 + hồ sơ mèo (tên, đồ đang mặc) ---------- */
  // fish = { e:{máy:số cá kiếm}, fd:{máy:số cá đã cho ăn}, ts, d:{day,v,x,f,keys}, p:{nm,eq,sn,t} }
  // Mỗi máy ghi bộ đếm riêng rồi cộng lại => đồng bộ nhiều thiết bị không mất cá.
  // p = hồ sơ mèo: nm = tên, eq = đồ đang mặc, sn = mốc quà cao nhất đã xem, t = thời điểm sửa (bản mới hơn thắng)
  var fish = null, fishReady = false, pending = [], gainAcc = 0, gainTimer = null, saveTimer = null;

  function devId() {
    try {
      var d = localStorage.getItem('meow_cat_dev');
      if (!d) { d = Math.random().toString(36).slice(2, 8); localStorage.setItem('meow_cat_dev', d); }
      return d;
    } catch (e) { return 'x'; }
  }
  var DEV = devId();
  function sum(o) { var t = 0; for (var k in o) t += o[k] | 0; return t; }
  function blankDay() { return { day: today(), v: 0, x: 0, f: 0, keys: {} }; }
  function normP(p) {
    p = p || {};
    var e = p.eq || {}, out = { h: '', s: '', o: '', a: '' };
    SLOT_ORDER.forEach(function (k) { var it = typeof e[k] === 'string' ? byId(e[k]) : null; out[k] = it && it.slot === k ? it.id : ''; });
    return { nm: String(p.nm || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, NAME_MAX), eq: out, sn: p.sn | 0, t: p.t | 0 };
  }
  function normFish(o) {
    o = o || {};
    var d = o.d && o.d.day ? o.d : blankDay();
    return { e: o.e || {}, fd: o.fd || {}, ts: o.ts | 0,
      d: { day: d.day, v: d.v | 0, x: d.x | 0, f: d.f | 0, keys: d.keys || {} }, p: normP(o.p) };
  }
  function mergeFish(a, b) {
    if (!a) return b ? normFish(b) : normFish();
    if (!b) return normFish(a);
    var r = normFish(), k;
    for (k in a.e) r.e[k] = Math.max(a.e[k] | 0, (b.e[k] | 0));
    for (k in b.e) r.e[k] = Math.max(r.e[k] | 0, b.e[k] | 0);
    for (k in a.fd) r.fd[k] = Math.max(a.fd[k] | 0, (b.fd[k] | 0));
    for (k in b.fd) r.fd[k] = Math.max(r.fd[k] | 0, b.fd[k] | 0);
    var pickD = a.d.day > b.d.day ? a : a.d.day < b.d.day ? b : (a.ts >= b.ts ? a : b);
    r.d = pickD.d; r.ts = Math.max(a.ts, b.ts);
    r.p = normP(a.p.t >= b.p.t ? a.p : b.p);
    r.p.sn = Math.max(a.p.sn, b.p.sn);
    return r;
  }
  function fishKeyOf(uid) { return 'meow_cat_fish_v1_' + (uid || 'guest'); }
  function readFish(uid) {
    try { var o = JSON.parse(localStorage.getItem(fishKeyOf(uid))); if (o && o.e) return normFish(o); } catch (e) {}
    return null;
  }
  function fishBalance() { return fish ? Math.max(0, sum(fish.e) - sum(fish.fd)) : 0; }
  function fishFedTotal() { return fish ? sum(fish.fd) : 0; }
  function rollDay() { if (fish.d.day !== today()) fish.d = blankDay(); }

  function persistFish() {
    fish.ts = Date.now();
    try { localStorage.setItem(fishKeyOf(ctx.uid), JSON.stringify(fish)); } catch (e) {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (ctx.canSync) ctx.client.from(TABLE).upsert({ user_id: ctx.uid, fish_state: fish, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).then(function () {}, function () {});
    }, 1500);
    updateFishUI();
  }

  function addFish(n, kind) {
    rollDay();
    var room = (kind === 'v' ? FISH_VOCAB_CAP : FISH_EX_CAP) - fish.d[kind];
    n = Math.min(n, room);
    if (n <= 0) return 0;
    fish.d[kind] += n;
    fish.e[DEV] = (fish.e[DEV] | 0) + n;
    persistFish();
    announceGain(n);
    return n;
  }
  function whenReady(fn) { if (fishReady) fn(); else pending.push(fn); }

  // 1 từ vựng đúng = +1 cá (mỗi từ chỉ được tính 1 lần/ngày)
  function correct(key) {
    whenReady(function () {
      rollDay();
      var k = 'v:' + key;
      if (fish.d.keys[k]) return;
      if (addFish(1, 'v')) fish.d.keys[k] = 1;
    });
  }
  // bài tập: điểm% -> tối đa 5 cá/phần/ngày; làm lại điểm cao hơn thì được thêm phần chênh
  function reward(key, score) {
    whenReady(function () {
      rollDay();
      var want = Math.max(0, Math.min(5, Math.floor((Number(score) || 0) / 20))), k = 'g:' + key, old = fish.d.keys[k] | 0;
      if (want > old) { var got = addFish(want - old, 'x'); if (got) fish.d.keys[k] = old + got; }
    });
  }
  function feed() {
    if (!fishReady) return false;
    rollDay();
    if (fishBalance() < 1 || fish.d.f >= FEED_CAP) return false;
    fish.fd[DEV] = (fish.fd[DEV] | 0) + 1; fish.d.f += 1;
    persistFish();
    return true;
  }
  function levelName() {
    var t = fishFedTotal(), name = LEVELS[0][1];
    for (var i = 0; i < LEVELS.length; i++) if (t >= LEVELS[i][0]) name = LEVELS[i][1];
    return name;
  }

  function hookTracking(tries) {
    var MT = window.MeowTracking;
    if (MT && MT.saveGame && !MT.__meowFish) {
      var orig = MT.saveGame;
      MT.saveGame = function (course, lesson, gameId, score) {
        try { reward(course + ':' + lesson + ':' + gameId, score); } catch (e) {}
        return orig.apply(this, arguments);
      };
      MT.__meowFish = true;
      return;
    }
    if (tries < 40) setTimeout(function () { hookTracking(tries + 1); }, 250);
  }

  /* ---------- hồ sơ: tên + đồ ---------- */
  function catName() { return (fish && fish.p.nm) || CAT.name; }
  function bestDays() { return lastView ? lastView.state.best : 0; }
  function countDays() { return lastView ? lastView.state.count : 0; }
  function touchP() { fish.p.t = Date.now(); }

  function eqSafe() { // chỉ cho mặc những món đã mở
    var out = { h: '', s: '', o: '', a: '' };
    if (!fish) return out;
    var best = bestDays();
    SLOT_ORDER.forEach(function (k) { var it = byId(fish.p.eq[k]); if (it && it.slot === k && it.day <= best) out[k] = it.id; });
    return out;
  }
  function unseen() {
    if (!fish || !lastView) return [];
    var best = bestDays();
    return ITEMS.filter(function (it) { return it.day <= best && it.day > fish.p.sn; });
  }
  function claimNew() { // mở quà mới: tự mặc món mới nhất của mỗi loại
    var list = unseen();
    if (!list.length) return [];
    list.forEach(function (it) { fish.p.eq[it.slot] = it.id; });
    fish.p.sn = list[list.length - 1].day;
    touchP(); persistFish();
    return list;
  }
  function nextItem() {
    var best = bestDays();
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].day > best) return ITEMS[i];
    return null;
  }
  function ringPct() {
    var it = nextItem();
    return it ? Math.max(0, Math.min(100, Math.round(countDays() / it.day * 100))) : 100;
  }
  function commitName(raw) {
    var v = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (!v) return false;
    fish.p.nm = v; touchP(); persistFish(); updateMini();
    return true;
  }
  function skipCount() { try { return +localStorage.getItem('meow_cat_nsk') || 0; } catch (e) { return 0; } }
  function bumpSkip() { try { localStorage.setItem('meow_cat_nsk', String(skipCount() + 1)); } catch (e) {} }

  /* ---------- giao diện ---------- */
  var zhc = CAT.zh.charAt(0);
  var CSS = [
    ':host{all:initial;--ink:#2A1B17;--mut:#8A7468;--bg:#FFFBF4;--line:#F0E4D2;--red:#D7263D;--red2:#A81A2D;--gold:#F2B632;',
    '--ice:#EAF5FC;--ice2:#2F6C8C;--mint:#1F8A6B;--f:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--fz:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}',
    '*{box-sizing:border-box;margin:0}button,input{font-family:var(--f)}button{-webkit-tap-highlight-color:transparent}',
    '[hidden]{display:none!important}.card:focus{outline:none}',

    /* nút mèo nhỏ */
    '.mini{--p:0;position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:99998;width:68px;height:68px;padding:0;border:0;background:none;cursor:pointer;transition:transform .15s}',
    '.mini:hover{transform:scale(1.06)}.mini:focus-visible{outline:3px solid var(--red);outline-offset:3px;border-radius:50%}',
    '.ring{position:absolute;inset:0;padding:4px;border-radius:50%;background:conic-gradient(var(--gold) calc(var(--p)*1%),#EBDDC6 0);box-shadow:0 8px 22px rgba(90,40,20,.28)}',
    '.av{display:block;width:100%;height:100%;overflow:hidden;border-radius:50%;border:2.5px solid #fff;background:radial-gradient(circle at 50% 25%,#FFF6E4,#FFE2B4)}',
    '.av svg{display:block;width:100%;height:100%}',
    '.badge{position:absolute;right:-9px;top:-5px;min-width:34px;height:24px;padding:0 7px;border-radius:99px;background:#fff;color:var(--red);border:2px solid var(--red);',
    'font:800 12px/20px var(--f);text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.18);white-space:nowrap}',
    '.fishpill{position:absolute;right:-12px;bottom:-5px;height:22px;padding:0 8px;border-radius:99px;background:#fff;border:2px solid #7FC4E8;color:#1F5F85;font:800 11px/18px var(--f);white-space:nowrap}',
    '.dot{position:absolute;left:-2px;top:-2px;width:16px;height:16px;border-radius:50%;background:#FF3B5C;border:3px solid #fff;animation:ping 1.8s ease-out infinite}',
    '.mini.wiggle{animation:wig 1.2s ease 2}',
    '.gain{position:fixed;left:92px;bottom:calc(44px + env(safe-area-inset-bottom,0px));z-index:99998;padding:6px 12px;border-radius:99px;background:#1F5F85;color:#fff;',
    'font:800 14px/1 var(--f);opacity:0;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.25)}.gain.on{animation:gainup 1.6s ease forwards}',

    /* lớp phủ + thẻ */
    '.ov{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(42,20,16,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
    '.ov.on{display:flex;animation:fade .2s ease}',
    '.card{position:relative;display:flex;flex-direction:column;width:100%;max-width:400px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:hidden;',
    'border-radius:28px;background:var(--bg);color:var(--ink);font:500 14px/1.45 var(--f);box-shadow:0 30px 80px rgba(42,20,16,.45);animation:pop .32s cubic-bezier(.2,1.2,.4,1)}',
    '@media(max-width:520px){.ov{align-items:flex-end;padding:0}.card{max-width:none;max-height:94vh;max-height:94dvh;border-radius:28px 28px 0 0;animation:sheet .34s cubic-bezier(.2,.9,.3,1)}}',

    /* hero: mèo + tên */
    '.hero{position:relative;flex:none;overflow:hidden;padding:14px 16px 12px;text-align:center;background:radial-gradient(120% 90% at 50% 0,#FFE0A8 0,#FFEFD2 48%,#FFFBF4 100%)}',
    '.hero:before{content:"' + zhc + '";position:absolute;right:-16px;top:-34px;font:900 176px/1 var(--fz);color:#F2B632;opacity:.15;pointer-events:none}',
    '.x{position:absolute;right:12px;top:12px;z-index:4;width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.8);color:var(--ink);font:600 20px/34px var(--f);cursor:pointer;padding:0}',
    '.x:hover{background:#fff}.x:focus-visible,.nmb:focus-visible,.tab:focus-visible,.it:focus-visible,.next:focus-visible,.chip:focus-visible{outline:3px solid var(--gold);outline-offset:2px}',
    '.lvl{position:absolute;left:12px;top:14px;z-index:4;padding:5px 11px;border-radius:99px;background:rgba(255,255,255,.85);color:#8A5A00;font-size:11.5px;font-weight:800}',
    '.cat{position:relative;z-index:1;display:flex;align-items:flex-end;justify-content:center;height:clamp(118px,23vh,170px);margin:8px auto 0}',
    '.cat:after{content:"";position:absolute;bottom:-3px;left:50%;width:62%;height:12px;margin-left:-31%;border-radius:50%;background:rgba(120,70,30,.2);filter:blur(3px);z-index:-1}',
    '.cat svg{height:100%;width:auto;aspect-ratio:200/232;overflow:visible;animation:bob 2.6s ease-in-out infinite}',
    '.cat.dress{animation:dress .45s ease}',
    '.cat .tail{transform-box:fill-box;transform-origin:0 100%;animation:tail 2.4s ease-in-out infinite}',
    '.eyes{transform-box:fill-box;transform-origin:50% 50%;animation:blink 4.6s infinite}.halo{animation:glow 2.6s ease-in-out infinite}',
    '.cat.eat svg{animation:chomp .55s ease}',
    '.fly{position:absolute;left:50%;top:38%;font-size:28px;margin:-14px 0 0 -14px;animation:fly .9s ease-in forwards;pointer-events:none}',
    '.hr{position:absolute;top:30%;font-size:20px;color:#E5486A;opacity:0;pointer-events:none;animation:hrt 1.4s ease-out .5s forwards}',
    '.hr.h1{left:30%}.hr.h2{left:50%;animation-delay:.65s}.hr.h3{left:68%;animation-delay:.8s}',
    '.cf{position:absolute;top:-14px;z-index:0;width:8px;height:12px;border-radius:2px;opacity:0;pointer-events:none;animation:cf 2.6s ease-in forwards}',

    '.nm{position:relative;z-index:2;margin-top:10px;display:flex;justify-content:center}',
    '.nmb{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:6px 14px;border:0;border-radius:99px;background:rgba(255,255,255,.8);color:#7A1020;font:800 18px/1.2 var(--f);cursor:pointer}',
    '.nmb .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nmb i{font-style:normal;font-size:13px;opacity:.55}',
    '.nmb.empty{border:1.5px dashed #E4B85A;background:#fff;color:#9A6A00;font-size:14px;animation:nudge 2.2s ease-in-out infinite}',
    '.nmf{position:relative;z-index:2;display:flex;justify-content:center;gap:6px;margin-top:10px}',
    '.nmf input{width:100%;max-width:190px;border:2px solid var(--gold);border-radius:12px;padding:8px 10px;background:#fff;color:var(--ink);font:700 16px var(--f);text-align:center}',
    '.nmf input:focus{outline:none;box-shadow:0 0 0 4px rgba(242,182,50,.35)}',
    '.nmf.big{margin-top:14px}.nmf.big input{max-width:none;font-size:18px;padding:12px}',
    '.sv{border:0;border-radius:12px;padding:0 14px;background:var(--red);color:#fff;font:800 13px var(--f);cursor:pointer}',
    '.mood{position:relative;z-index:2;min-height:19px;margin-top:6px;font-size:13px;font-weight:600;color:#7A5A4A}',

    /* tab */
    '.tabs{flex:none;display:flex;gap:4px;margin:0 16px;padding:4px;border-radius:16px;background:#F4E9D7}',
    '.tab{flex:1;padding:10px 8px;border:0;border-radius:12px;background:none;color:var(--mut);font:800 13px/1 var(--f);cursor:pointer;transition:background .15s,color .15s}',
    '.tab[aria-selected=true]{background:#fff;color:var(--red2);box-shadow:0 2px 6px rgba(90,50,20,.12)}',
    '.tab em{margin-left:5px;padding:2px 7px;border-radius:99px;background:#F4E9D7;color:#8A5A00;font:800 10.5px var(--f);font-style:normal}',
    '.tab[aria-selected=true] em{background:#FFE9B8}',

    /* thân */
    '.body{flex:1;min-height:0;overflow:auto;padding:14px 16px 8px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
    '.ttl{font:800 20px/1.25 var(--f);color:#7A1020;text-align:center}.sub{margin-top:6px;text-align:center;color:#6A5248;font-size:13.5px}',
    '.sum{padding:14px;border-radius:20px;background:#fff;border:1.5px solid var(--line)}',
    '.srow{display:flex;align-items:center;gap:12px}.fire{font-size:40px;line-height:1;transform-origin:50% 90%;animation:fl 1.2s ease-in-out infinite}',
    '.big{font:900 40px/1 var(--f);color:var(--red)}.big small{margin-left:6px;font-size:14px;font-weight:800;color:#8A3A30}',
    '.sumz{margin-top:3px;font:700 12px var(--fz);color:#A07A3A}',
    '.msg{margin-top:10px;padding-top:10px;border-top:1.5px dashed var(--line)}.msg h3{font:800 16px/1.3 var(--f);color:#7A1020}.msg p{margin-top:2px;font-size:13px;color:#6A5248}',
    '.week{display:flex;justify-content:space-between;margin-top:12px;padding:12px 8px 8px;border-radius:20px;background:#fff;border:1.5px solid var(--line)}',
    '.d{flex:1;text-align:center}.d i{display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0 auto 4px;border-radius:50%;background:#F6EEDF;color:#fff;font-style:normal;font-size:14px;font-weight:800}',
    '.d.k i{background:linear-gradient(180deg,#FF6B5E,var(--red));box-shadow:0 2px 0 var(--red2)}.d.f i{background:#8FD0F0}',
    '.d.t i{outline:2.5px solid var(--gold);outline-offset:2px}.d span{font-size:11px;font-weight:700;color:#A8957F}.d.t span{color:var(--red)}',
    '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}',
    '.st{padding:10px 6px;border-radius:16px;background:#fff;border:1.5px solid var(--line);text-align:center}',
    '.st b{display:block;font:900 20px/1.1 var(--f)}.st span{display:block;margin-top:3px;font-size:11px;font-weight:700;color:var(--mut)}',
    '.st.ice{background:var(--ice);border-color:#CDEBFA}.st.ice b{color:var(--ice2)}',
    '.note{margin-top:8px;text-align:center;font-size:11.5px;color:var(--mut)}',
    '.next{display:flex;align-items:center;gap:12px;width:100%;margin-top:12px;padding:12px;border:1.5px solid #F2D58A;border-radius:20px;background:linear-gradient(135deg,#FFF2D2,#FFE6B5);text-align:left;font:inherit;color:inherit;cursor:pointer}',
    '.next .gt{flex:none;width:58px;height:58px;overflow:hidden;border-radius:16px;background:#fff}.next .gt svg{width:100%;height:100%;filter:grayscale(1);opacity:.5}',
    '.next .tx{flex:1;min-width:0}.next b{display:block;font-size:13.5px;color:#6A3E00}.next small{display:block;color:#8A5A00;font-size:12px}.next .go2{font-size:20px;color:#8A5A00}',
    '.bar{height:8px;margin-top:7px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.75)}.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#F2B632,#FF8A3D)}',
    '.next.done{cursor:default;justify-content:center;font-weight:800;color:#6A3E00}',
    '.pantry{margin-top:12px;padding:12px;border-radius:20px;background:#EEF8F3;border:1.5px solid #CFE8DA}',
    '.prow{display:flex;align-items:center;justify-content:space-between;gap:10px}.fn{font-size:13px;color:#2F6C58}.fn b{font-size:20px;color:#1F5F4A}',
    '.pips{display:flex;align-items:center;gap:4px;margin-top:4px}.pips i{width:11px;height:11px;border-radius:50%;background:#D5E8DE;border:1.5px solid #B7D6C5}',
    '.pips i.on{background:#F2B632;border-color:#C48A00}.pips em{margin-left:4px;font-style:normal;font-size:11px;color:#5B8A76}',
    '.feed{padding:11px 17px;border:0;border-radius:99px;background:var(--mint);color:#fff;font:800 13.5px/1 var(--f);cursor:pointer;box-shadow:0 3px 0 #146048;white-space:nowrap}',
    '.feed:active:not(:disabled){transform:translateY(3px);box-shadow:none}.feed:disabled{background:#B9C9C2;box-shadow:none;cursor:default}',
    '.feed:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.phint{margin-top:7px;font-size:11.5px;color:#5B8A76}',
    '.mail{margin:12px 0 4px;padding:12px;border-radius:20px;background:#fff;border:1.5px solid var(--line);font-size:12.5px;color:#6A5248}',
    '.mrow{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '.lnk{padding:4px 0;border:0;background:none;color:var(--red);font:700 12.5px/1.3 var(--f);text-align:left;text-decoration:underline;cursor:pointer}.lnk.center{display:block;margin:12px auto 4px;text-align:center}',
    '.mform{display:flex;gap:6px;margin-top:8px}.mform input{flex:1;min-width:0;padding:9px 10px;border:1.5px solid #E6D3AE;border-radius:10px;background:#fff;color:var(--ink);font:500 13px var(--f)}',
    '.mform input:focus{outline:2px solid var(--gold)}.mform .sv{background:var(--gold);color:#5A3300;border-radius:10px}.mmsg{margin-top:4px;font-size:12px;color:#B3261E}',

    /* tủ đồ */
    '.detail{margin-bottom:12px;padding:10px 12px;border-radius:16px;background:#fff;border:1.5px solid var(--line);font-size:12.5px;color:#6A5248}',
    '.detail b{display:block;font-size:14px;color:var(--ink)}.detail b em{margin-left:6px;font:700 13px var(--fz);font-style:normal;color:#A07A3A}.detail .py{display:block;color:#A07A3A;font-size:12px}',
    '.cl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '.it{position:relative;display:block;padding:6px 6px 9px;border:2px solid var(--line);border-radius:18px;background:#fff;text-align:center;font:inherit;color:inherit;cursor:pointer;transition:transform .12s,border-color .12s}',
    '.it:active{transform:scale(.97)}.it.sel{border-color:#E6C27A}.it.on{border-color:var(--gold);background:#FFF8E4;box-shadow:0 0 0 3px rgba(242,182,50,.28)}',
    '.th{position:relative;height:76px;overflow:hidden;border-radius:12px;background:#FFF3E0}.th svg{display:block;width:100%;height:100%}',
    '.it.lock .th svg{filter:grayscale(1);opacity:.32}',
    '.slot{position:absolute;left:5px;top:5px;z-index:1;padding:1px 7px;border-radius:99px;background:rgba(255,255,255,.9);color:#8A5A00;font-size:9.5px;font-weight:800}',
    '.lk{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px}',
    '.tick{position:absolute;right:5px;top:5px;z-index:1;width:18px;height:18px;border-radius:50%;background:var(--mint);color:#fff;font:800 11px/18px var(--f)}',
    '.it b{display:block;min-height:29px;margin-top:6px;font-size:12px;line-height:1.25}.it small{display:block;font-size:11px;font-weight:700;color:var(--mut)}.it.lock small{color:var(--red)}',

    /* màn đặt tên / nhận quà */
    '.sugg{margin-top:14px;font-size:12px;font-weight:700;color:var(--mut);text-align:center}',
    '.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:8px}',
    '.chip{padding:8px 14px;border:1.5px solid #F0D9A8;border-radius:99px;background:#fff;color:#7A4A00;font:700 13px var(--f);cursor:pointer}.chip:hover{background:#FFF3D6}',
    '.nerr{min-height:18px;margin-top:6px;text-align:center;font-size:12.5px;color:#B3261E}',
    '.rwl{display:flex;flex-direction:column;gap:8px;margin-top:14px}',
    '.rw{display:flex;align-items:center;gap:12px;padding:8px;border-radius:18px;background:#fff;border:1.5px solid #F2D58A;box-shadow:0 0 0 3px rgba(242,182,50,.18)}',
    '.rw .th{flex:none;width:64px;height:64px}.rw b{display:block;font-size:14px}.rw em{display:block;font:700 12px var(--fz);font-style:normal;color:#A07A3A}.rw small{color:var(--mut);font-size:11.5px}',

    /* chân */
    '.foot{flex:none;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(255,251,244,0),var(--bg) 30%)}',
    '.go{display:block;width:100%;padding:15px 18px;border:0;border-radius:16px;background:var(--red);color:#fff;font:800 15.5px/1 var(--f);cursor:pointer;box-shadow:0 4px 0 var(--red2);transition:transform .08s,box-shadow .08s}',
    '.go:active{transform:translateY(3px);box-shadow:0 1px 0 var(--red2)}.go:focus-visible{outline:3px solid var(--gold);outline-offset:3px}',

    /* chuyển động */
    '@keyframes fly{0%{transform:translate(-110px,70px) rotate(-30deg) scale(1.3);opacity:1}80%{opacity:1}100%{transform:translate(0,0) rotate(0) scale(.3);opacity:0}}',
    '@keyframes chomp{0%,100%{transform:scale(1)}30%{transform:scale(1.06,.94)}60%{transform:scale(.97,1.04)}}',
    '@keyframes hrt{0%{transform:translateY(0) scale(.6);opacity:0}20%{opacity:1}100%{transform:translateY(-46px) scale(1.2);opacity:0}}',
    '@keyframes gainup{0%{transform:translateY(8px);opacity:0}15%{opacity:1}70%{opacity:1}100%{transform:translateY(-28px);opacity:0}}',
    '@keyframes pop{from{transform:scale(.88) translateY(16px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes sheet{from{transform:translateY(60px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes fade{from{opacity:0}to{opacity:1}}',
    '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
    '@keyframes fl{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.15) rotate(3deg)}}',
    '@keyframes wig{0%,100%{transform:rotate(0)}25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}',
    '@keyframes tail{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(9deg)}}',
    '@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}',
    '@keyframes glow{0%,100%{opacity:.75}50%{opacity:1}}',
    '@keyframes dress{0%{transform:scale(.93)}60%{transform:scale(1.06)}100%{transform:scale(1)}}',
    '@keyframes nudge{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
    '@keyframes ping{0%{box-shadow:0 0 0 0 rgba(255,59,92,.55)}80%,100%{box-shadow:0 0 0 9px rgba(255,59,92,0)}}',
    '@keyframes cf{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(320px) rotate(560deg);opacity:0}}',
    '@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.cf{display:none}}'
  ].join('');

  var host, root, ov, badge, mini, lastView = null, lastFocus = null;
  var ctx = { client: null, uid: null, canSync: false }, prefs = null;
  var ui = { mode: 'main', tab: 'today', editing: false, sel: null, newIds: [] };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function copyFor(view) {
    var n = view.state.count, kind = view.kind, name = esc(catName()), fz = view.state.freezes;
    var ms = MILESTONES.indexOf(n) >= 0 && (kind === 'extended' || kind === 'saved');
    var h, p;
    if (kind === 'first') {
      h = 'Chào bạn! Mình bắt đầu chuỗi nhé';
      p = 'Hôm nay là ngày đầu tiên. Mai quay lại để chuỗi lên ' + (n + 1) + ' ngày nha!';
    } else if (kind === 'extended') {
      h = ms ? 'Mốc ' + n + ' ngày liên tiếp!' : 'Đã giữ chuỗi hôm nay!';
      p = ms ? name + ' tự hào về bạn lắm. 太棒了!' : name + ' đã giữ chuỗi giúp bạn rồi. Mai nhớ quay lại nha!';
    } else if (kind === 'saved') {
      h = 'Thẻ đóng băng đã cứu chuỗi! ❄';
      p = 'Bạn vắng ' + view.missed + ' ngày, ' + name + ' đã dùng ' + view.used + ' thẻ để giữ chuỗi ' + n + ' ngày cho bạn.';
    } else if (kind === 'reset') {
      h = 'Chuỗi cũ đã đứt, mình làm lại nhé';
      p = 'Chuỗi ' + view.prev + ' ngày trước đó đã dừng (bạn vắng ' + view.missed + ' ngày mà chỉ có ' + fz + ' thẻ ❄). ' +
        'Từ hôm nay ' + name + ' cùng bạn đếm lại từ 1. Đồ đã mở vẫn là của bạn!';
    } else {
      h = 'Hôm nay bạn đã giữ chuỗi rồi';
      p = 'Chuỗi vẫn đang an toàn. Mai quay lại để lên ' + (n + 1) + ' ngày nhé!';
    }
    if (view.earned) p += ' Bạn vừa nhận thêm 1 thẻ đóng băng ❄!';
    return { h: h, p: p };
  }

  function weekHTML(state) {
    var t = today(), dow = (parse(t).getDay() + 6) % 7, mon = addDays(t, -dow);
    var labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], map = {}, cur = state.last, left = state.count, guard = 0, h = '';
    while (left > 0 && guard++ < 400) {          // đi lùi từ ngày cuối: ngày đóng băng không tính vào số ngày
      if (state.frozen.indexOf(cur) >= 0) map[cur] = 'f'; else { map[cur] = 'k'; left--; }
      cur = addDays(cur, -1);
    }
    for (var i = 0; i < 7; i++) {
      var day = addDays(mon, i), m = map[day];
      h += '<div class="d' + (m ? ' ' + m : '') + (day === t ? ' t' : '') + '"><i>' + (m === 'k' ? '✓' : m === 'f' ? '❄' : '') + '</i><span>' + labels[i] + '</span></div>';
    }
    return h;
  }

  function maskEmail(e) {
    var i = e.indexOf('@');
    return i < 1 ? e : e.charAt(0) + '***' + e.slice(i);
  }

  function mailHTML() {
    if (!ctx.canSync) return '';
    if (prefs && prefs.on && prefs.email) {
      return '<div class="mail"><div class="mrow"><span>📧 Đang nhắc qua <b>' + esc(maskEmail(prefs.email)) + '</b></span>' +
        '<button class="lnk" type="button" data-act="mail-off">Tắt nhắc</button></div></div>';
    }
    return '<div class="mail"><button class="lnk" type="button" data-act="mail-open">📧 Nhắn nhẹ cho mình qua email khi sắp đứt chuỗi</button>' +
      '<div class="mform" hidden><input type="email" inputmode="email" autocomplete="email" placeholder="email thật của bạn, vd: ban@gmail.com" aria-label="Email nhận nhắc nhở">' +
      '<button type="button" class="sv" data-act="mail-save">Bật nhắc</button></div><div class="mmsg" role="status"></div></div>';
  }
  function refreshMail() {
    var box = ov.querySelector('.mail'); if (!box) return;
    var tmp = document.createElement('div'); tmp.innerHTML = mailHTML();
    if (tmp.firstChild) box.parentNode.replaceChild(tmp.firstChild, box); else box.parentNode.removeChild(box);
  }

  function announceGain(n) {
    if (!root) return;
    gainAcc += n;
    clearTimeout(gainTimer);
    gainTimer = setTimeout(function () {
      var g = root.querySelector('.gain');
      if (g) {
        g.textContent = '+' + gainAcc + ' 🐟'; gainAcc = 0;
        g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
      }
      if (mini) { mini.classList.remove('wiggle'); void mini.offsetWidth; mini.classList.add('wiggle'); }
    }, 350);
  }

  function updateDot() {
    var d = root && root.querySelector('.dot');
    if (!d || !fishReady) return;
    rollDay();
    d.hidden = !(unseen().length > 0 || (fishBalance() > 0 && fish.d.f < FEED_CAP));
  }
  function updateFishUI() {
    if (!root) return;
    var pill = root.querySelector('.fishpill'), b = fishBalance();
    if (pill) { pill.textContent = '🐟 ' + b; pill.hidden = b < 1; }
    updateDot();
  }
  function updateMini() {
    if (!mini) return;
    var av = mini.querySelector('.av');
    if (av) { var mm = moodNow(null); av.innerHTML = catSVG('mini', eqSafe(), mm === 'sad' ? 'sad' : ''); }
    if (lastView) {
      badge.textContent = '🔥 ' + lastView.state.count;
      mini.style.setProperty('--p', ringPct());
    }
    mini.setAttribute('aria-label', 'Mở chuỗi học và tủ đồ của ' + catName());
    mini.title = catName() + ' · ' + CAT.zh + ' ' + CAT.py;
    updateDot();
  }

  function moodText(o) {
    var f = fish ? fish.d.f : 0, bal = fishBalance();
    if (ui.mode === 'adopt') return 'Meo~ bạn đặt tên cho mình nhé?';
    if (ui.mode === 'reward') return 'Oa! Mình có đồ mới rồi nè!';
    if (o && o.named) return 'Meo~ Mình thích cái tên "' + catName() + '" lắm! ♥';
    if (o && o.fed) return f >= FEED_CAP ? 'Ực… no căng rồi! Cảm ơn bạn nhiều ♥' : ['好吃! Ngon quá, cảm ơn bạn!', 'Nhồm nhoàm… ngon ghê á!', 'Meo meo~ thêm miếng nữa nha!'][f % 3];
    if (f >= FEED_CAP) return 'Mèo no rồi, mai ăn tiếp nhé!';
    if (f >= 3) return 'Mèo no căng rồi ♥';
    if (f >= 1) return 'Mèo ăn ngon lắm, cảm ơn bạn!';
    return bal > 0 ? 'Meo~ mình đói bụng, bạn cho mình ăn cá nhé!' : 'Meo~ mình đói… làm bài đúng để kiếm cá cho mình nhé!';
  }

  function pantryHTML() {
    if (!fishReady) return '';
    rollDay();
    var bal = fishBalance(), f = fish.d.f, pips = '';
    for (var i = 0; i < FEED_CAP; i++) pips += '<i class="' + (i < f ? 'on' : '') + '"></i>';
    var full = f >= FEED_CAP, can = bal > 0 && !full;
    return '<div class="pantry"><div class="prow"><div><div class="fn">🐟 <b>' + bal + '</b> cá trong túi</div>' +
      '<div class="pips">' + pips + '<em>hôm nay đã ăn ' + f + '/' + FEED_CAP + '</em></div></div>' +
      '<button type="button" class="feed" data-act="feed"' + (can ? '' : ' disabled') + '>' + (full ? 'Mèo no rồi' : bal < 1 ? 'Hết cá' : 'Cho ăn 🐟') + '</button></div>' +
      '<div class="phint">Đúng 1 câu từ vựng +1 🐟 · Làm bài tập tới +5 🐟 mỗi phần · đã cho ăn tổng ' + fishFedTotal() + ' 🐟</div></div>';
  }

  /* --- thẻ: hero --- */
  function nameHTML() {
    var nm = fish.p.nm;
    if (ui.editing) {
      return '<form class="nmf" data-form="name" autocomplete="off"><input maxlength="' + NAME_MAX + '" value="' + esc(nm) + '" placeholder="Tên mèo của bạn" aria-label="Tên mèo">' +
        '<button class="sv" type="submit">Lưu</button></form>';
    }
    if (!nm) return '<div class="nm"><button class="nmb empty" type="button" data-act="edit-name">＋ Đặt tên cho mèo</button></div>';
    return '<div class="nm"><button class="nmb" type="button" data-act="edit-name" aria-label="Đổi tên mèo: ' + esc(nm) + '"><span class="t">' + esc(nm) + '</span><i>✎</i></button></div>';
  }
  // Tâm trạng của mèo: vui khi vừa được ăn / đặt tên / nhận quà; buồn khi đói (hôm nay chưa được ăn) hoặc chuỗi vừa bị đứt; còn lại cười nhẹ.
  // Muốn mèo CHỈ buồn khi mất chuỗi (không buồn vì đói): xoá điều kiện `hungry` bên dưới.
  function moodNow(o) {
    if ((o && (o.fed || o.named)) || ui.mode !== 'main') return 'happy';
    if (fish) rollDay();
    var f = fish ? fish.d.f : 0;
    var lost = !!(lastView && lastView.kind === 'reset');
    var hungry = fishReady && f < 1;
    if ((hungry || lost) && f < 1) return 'sad';
    return '';
  }
  function catBoxHTML(o) {
    return catSVG('full', eqSafe(), moodNow(o)) +
      (o && o.fed ? '<span class="fly">🐟</span><span class="hr h1">♥</span><span class="hr h2">♥</span><span class="hr h3">♥</span>' : '');
  }
  function heroHTML(o) {
    var cf = '';
    if (ui.mode === 'reward') {
      var colors = ['#D7263D', '#F2B632', '#2FA39A', '#3B7DD8', '#F26B6B', '#FFD25E'];
      for (var i = 0; i < 24; i++) {
        cf += '<span class="cf" style="left:' + ((i * 41 + 7) % 100) + '%;background:' + colors[i % colors.length] + ';animation-delay:' + ((i % 8) * 0.12).toFixed(2) + 's"></span>';
      }
    }
    return '<div class="hero">' + cf +
      (fishReady && ui.mode === 'main' ? '<span class="lvl">' + esc(levelName()) + '</span>' : '') +
      '<button class="x" type="button" data-act="close" aria-label="Đóng">×</button>' +
      '<div class="cat' + (o && o.fed ? ' eat' : '') + '">' + catBoxHTML(o) + '</div>' +
      (ui.mode === 'main' ? nameHTML() : (ui.mode === 'reward' ? '<div class="nm"><span class="nmb">' + esc(catName()) + '</span></div>' : '')) +
      '<div class="mood">' + esc(moodText(o)) + '</div></div>';
  }

  /* --- thẻ: tab Hôm nay --- */
  function nextHTML() {
    var it = nextItem(), n = countDays();
    if (!it) return '<div class="next done">🎉 Bạn đã mở toàn bộ tủ đồ rồi, quá đỉnh!</div>';
    return '<button type="button" class="next" data-act="tab-closet"><div class="gt">' + thumbSVG(it) + '</div>' +
      '<div class="tx"><b>Quà kế tiếp: ' + esc(it.name) + '</b><small>Còn ' + Math.max(1, it.day - n) + ' ngày nữa · mốc ' + it.day + ' ngày</small>' +
      '<div class="bar"><i style="width:' + ringPct() + '%"></i></div></div><span class="go2">›</span></button>';
  }
  function todayHTML() {
    var v = lastView, s = v.state, c = copyFor(v);
    return '<div class="sum"><div class="srow"><span class="fire">🔥</span><div><div class="big">' + s.count + '<small>ngày liên tiếp</small></div>' +
      '<div class="sumz">连续 ' + s.count + ' 天</div></div></div>' +
      '<div class="msg"><h3>' + c.h + '</h3><p>' + c.p + '</p></div></div>' +
      '<div class="week">' + weekHTML(s) + '</div>' +
      '<div class="stats"><div class="st"><b>🏆 ' + s.best + '</b><span>Kỷ lục (ngày)</span></div>' +
      '<div class="st ice"><b>❄ ' + s.freezes + '/' + MAX_FREEZES + '</b><span>Thẻ đóng băng</span></div>' +
      '<div class="st"><b>🐟 ' + fishBalance() + '</b><span>Cá trong túi</span></div></div>' +
      '<div class="note">Vắng 1 hôm, mèo tự dùng thẻ ❄ để giữ chuỗi. Học đủ ' + FREEZE_EVERY + ' ngày liên tiếp nhận thêm 1 thẻ.</div>' +
      nextHTML() + pantryHTML() + mailHTML();
  }

  /* --- thẻ: tab Tủ đồ --- */
  function detailHTML() {
    var it = ui.sel ? byId(ui.sel) : null, best = bestDays();
    if (!it) return '<b>Tủ đồ của ' + esc(catName()) + ' · ' + countUnlocked() + '/' + ITEMS.length + ' món</b>Giữ chuỗi để mở quà. Bấm vào món đồ để mặc hoặc cởi.';
    var lock = it.day > best;
    return '<b>' + esc(it.name) + '<em>' + it.zh + '</em></b><span class="py">' + it.py + '</span>' +
      (lock ? 'Giữ chuỗi ' + it.day + ' ngày để mở khoá (còn ' + Math.max(1, it.day - countDays()) + ' ngày).'
            : (fish.p.eq[it.slot] === it.id ? 'Đang mặc. Bấm lần nữa để cởi.' : 'Đã mở khoá. Bấm để mặc cho mèo.'));
  }
  function countUnlocked() { var b = bestDays(); return ITEMS.filter(function (i) { return i.day <= b; }).length; }
  function closetHTML() {
    var best = bestDays(), eq = eqSafe(), h = '<div class="detail">' + detailHTML() + '</div><div class="cl">';
    ITEMS.forEach(function (it) {
      var lock = it.day > best, on = !lock && eq[it.slot] === it.id;
      h += '<button type="button" class="it' + (lock ? ' lock' : '') + (on ? ' on' : '') + (ui.sel === it.id ? ' sel' : '') + '" data-act="eq" data-id="' + it.id + '" aria-pressed="' + on + '">' +
        '<div class="th"><span class="slot">' + SLOTS[it.slot] + '</span>' + thumbSVG(it) + (lock ? '<span class="lk">🔒</span>' : '') + (on ? '<span class="tick">✓</span>' : '') + '</div>' +
        '<b>' + esc(it.name) + '</b><small>' + (lock ? 'Mốc ' + it.day + ' ngày' : on ? 'Đang mặc' : 'Đã mở') + '</small></button>';
    });
    return h + '</div><button class="lnk center" type="button" data-act="strip">Cởi hết đồ</button>';
  }

  /* --- thẻ: đặt tên + nhận quà --- */
  function adoptHTML() {
    var chips = NAME_IDEAS.map(function (n) { return '<button type="button" class="chip" data-act="chip" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('');
    return '<h2 class="ttl">Đặt tên cho chú mèo của bạn</h2>' +
      '<p class="sub">Mèo sẽ ở bên bạn mỗi ngày học, cùng bạn giữ chuỗi và nhận quà. Bạn có thể đổi tên bất cứ lúc nào.</p>' +
      '<form class="nmf big" data-form="adopt" autocomplete="off"><input maxlength="' + NAME_MAX + '" placeholder="Nhập tên mèo…" aria-label="Tên mèo"></form>' +
      '<div class="nerr" role="alert"></div><div class="sugg">Hoặc chọn một cái tên:</div><div class="chips">' + chips + '</div>';
  }
  function rewardHTML() {
    var list = ui.newIds.map(byId).filter(Boolean);
    var rows = list.map(function (it) {
      return '<div class="rw"><div class="th">' + thumbSVG(it) + '</div><div><b>' + esc(it.name) + '</b><em>' + it.zh + ' · ' + it.py + '</em><small>' + SLOTS[it.slot] + ' · mốc ' + it.day + ' ngày</small></div></div>';
    }).join('');
    return '<h2 class="ttl">🎁 Quà mới cho ' + esc(catName()) + '!</h2>' +
      '<p class="sub">Bạn đã giữ chuỗi <b>' + bestDays() + ' ngày</b> nên mèo nhận được ' + (list.length > 1 ? list.length + ' món quà' : 'một món quà') + '. Mèo đã mặc thử luôn rồi!</p>' +
      '<div class="rwl">' + rows + '</div>';
  }

  function tabsHTML() {
    return '<div class="tabs" role="tablist">' +
      '<button class="tab" type="button" role="tab" data-act="tab-today" aria-selected="' + (ui.tab === 'today') + '">🔥 Hôm nay</button>' +
      '<button class="tab" type="button" role="tab" data-act="tab-closet" aria-selected="' + (ui.tab === 'closet') + '">🎀 Tủ đồ<em>' + countUnlocked() + '/' + ITEMS.length + '</em></button></div>';
  }
  function bodyHTML() {
    if (ui.mode === 'adopt') return adoptHTML();
    if (ui.mode === 'reward') return rewardHTML();
    return ui.tab === 'closet' ? closetHTML() : todayHTML();
  }
  function footHTML() {
    if (ui.mode === 'adopt') return '<button class="go" type="button" data-act="adopt">Nhận nuôi mèo 🐾</button><button class="lnk center" type="button" data-act="skip">Để sau</button>';
    if (ui.mode === 'reward') return '<button class="go" type="button" data-act="rw-ok">Tuyệt vời! Học tiếp thôi 加油</button><button class="lnk center" type="button" data-act="rw-closet">Xem tủ đồ</button>';
    return '<button class="go" type="button" data-act="close">Học tiếp thôi! 加油</button>';
  }

  function renderCard(o, keepScroll) {
    var old = ov.querySelector('.body'), st = old && keepScroll ? old.scrollTop : 0;
    ov.innerHTML = '<div class="card" role="dialog" tabindex="-1" aria-modal="true" aria-label="Chuỗi học và tủ đồ của ' + esc(catName()) + '">' +
      heroHTML(o) + (ui.mode === 'main' ? tabsHTML() : '') +
      '<div class="body">' + bodyHTML() + '</div><div class="foot">' + footHTML() + '</div></div>';
    var nb = ov.querySelector('.body'); if (nb) nb.scrollTop = st;
  }
  function refreshBody(keepScroll) { // chỉ vẽ lại tab + thân, giữ nguyên hero (mèo không bị giật)
    var b = ov.querySelector('.body'), st = b && keepScroll ? b.scrollTop : 0;
    var t = ov.querySelector('.tabs');
    if (t) { var tmp = document.createElement('div'); tmp.innerHTML = tabsHTML(); t.parentNode.replaceChild(tmp.firstChild, t); }
    if (b) { b.innerHTML = bodyHTML(); b.scrollTop = st; }
  }
  function refreshCat(o) {
    var c = ov.querySelector('.cat'); if (!c) return;
    c.innerHTML = catBoxHTML(o);
    c.classList.remove('dress'); void c.offsetWidth; c.classList.add('dress');
  }

  function focusInitial() {
    var el = ui.mode === 'adopt' ? ov.querySelector('.nmf input') : ov.querySelector('.card');
    if (el && el.focus) el.focus();
  }
  function pickMode(auto) {
    if (auto && !fish.p.nm && skipCount() < 3) return 'adopt';
    if (unseen().length) { ui.newIds = claimNew().map(function (it) { return it.id; }); updateMini(); return 'reward'; }
    return 'main';
  }
  function open(auto) {
    if (!lastView || !ov || !fishReady) return;
    lastFocus = document.activeElement;
    ui.tab = 'today'; ui.editing = false; ui.sel = null;
    ui.mode = pickMode(!!auto);
    renderCard();
    ov.classList.add('on');
    focusInitial();
  }
  function close() {
    ov.classList.remove('on');
    ui.editing = false;
    updateDot();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* --- xử lý thao tác --- */
  function handle(act, t) {
    var el, box;
    switch (act) {
      case 'close': close(); break;
      case 'tab-today': case 'tab-closet':
        ui.tab = act === 'tab-closet' ? 'closet' : 'today'; ui.sel = null; refreshBody(false);
        el = ov.querySelector('.tab[aria-selected=true]'); if (el) el.focus();
        break;
      case 'edit-name':
        ui.editing = true; renderCard(null, true);
        el = ov.querySelector('.nmf input'); if (el) { el.focus(); el.select(); }
        break;
      case 'chip':
        el = ov.querySelector('.nmf input'); if (el) { el.value = t.getAttribute('data-n'); el.focus(); }
        break;
      case 'adopt': submitName(ov.querySelector('.nmf input')); break;
      case 'skip':
        bumpSkip(); ui.mode = pickMode(false); renderCard(); focusInitial();
        break;
      case 'rw-ok': ui.mode = 'main'; ui.tab = 'today'; renderCard(); focusInitial(); break;
      case 'rw-closet': ui.mode = 'main'; ui.tab = 'closet'; renderCard(); el = ov.querySelector('.tab[aria-selected=true]'); if (el) el.focus(); break;
      case 'eq': closetTap(t.getAttribute('data-id')); break;
      case 'strip':
        fish.p.eq = { h: '', s: '', o: '', a: '' }; touchP(); persistFish(); updateMini(); refreshCat(); refreshBody(true);
        break;
      case 'feed':
        if (!feed()) return;
        renderCard({ fed: true }, true);
        updateMini();
        el = ov.querySelector('.feed'); (el && !el.disabled ? el : ov.querySelector('.go')).focus();
        break;
      case 'mail-open':
        box = ov.querySelector('.mail'); box.querySelector('.mform').hidden = false; t.hidden = true; box.querySelector('input').focus();
        break;
      case 'mail-save':
        box = ov.querySelector('.mail');
        var em = box.querySelector('input').value.trim(), msg = box.querySelector('.mmsg');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) || /@meowmeow\.example\.com$/i.test(em)) { msg.textContent = 'Email chưa đúng, bạn kiểm tra lại nhé.'; return; }
        msg.textContent = 'Đang lưu…';
        saveEmailPrefs(em, true).then(function (ok) {
          if (!ok) { msg.textContent = 'Chưa lưu được, bạn thử lại sau nhé.'; return; }
          prefs = { email: em, on: true }; refreshMail();
        });
        break;
      case 'mail-off':
        saveEmailPrefs(prefs ? prefs.email : '', false).then(function (ok) {
          if (ok) { prefs = { email: prefs ? prefs.email : '', on: false }; refreshMail(); }
        });
        break;
    }
  }

  function closetTap(id) {
    var it = byId(id); if (!it) return;
    ui.sel = id;
    if (it.day <= bestDays()) {
      fish.p.eq[it.slot] = fish.p.eq[it.slot] === id ? '' : id;
      touchP(); persistFish(); updateMini(); refreshCat();
    }
    refreshBody(true);
    var again = ov.querySelector('.it[data-id="' + id + '"]'); if (again) again.focus();
  }

  function submitName(input) {
    var v = input ? input.value : '';
    if (ui.mode === 'adopt') {
      if (!commitName(v)) {
        var er = ov.querySelector('.nerr'); if (er) er.textContent = 'Bạn gõ tên cho mèo nhé (tối đa ' + NAME_MAX + ' ký tự).';
        if (input) input.focus();
        return;
      }
      ui.mode = pickMode(false);
      renderCard(ui.mode === 'main' ? { named: true } : null);
      focusInitial();
    } else {
      ui.editing = false;
      var ok = commitName(v);
      renderCard(ok ? { named: true } : null, true);
      var b = ov.querySelector('.nmb'); if (b) b.focus();
    }
  }

  function trapKeys(e) {
    if (!ov || !ov.classList.contains('on')) return;
    if (e.key === 'Escape') {
      if (ui.editing) { ui.editing = false; renderCard(null, true); var b = ov.querySelector('.nmb'); if (b) b.focus(); }
      else close();
      return;
    }
    if (e.key !== 'Tab') return;
    var list = [].filter.call(ov.querySelectorAll('button:not([disabled]),input'), function (x) { return x.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1], a = root.activeElement;
    if (e.shiftKey && (a === first || !a)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }

  function build() {
    host = document.createElement('div');
    host.id = 'meow-cat-root';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<button class="mini" type="button" aria-haspopup="dialog"><span class="ring"><span class="av"></span></span>' +
      '<span class="badge">…</span><span class="fishpill" hidden>🐟 0</span><span class="dot" hidden></span></button>' +
      '<div class="gain" aria-live="polite"></div><div class="ov"></div>';
    document.body.appendChild(host);
    mini = root.querySelector('.mini');
    badge = root.querySelector('.badge');
    ov = root.querySelector('.ov');
    mini.onclick = function () { open(false); };
    mini.addEventListener('animationend', function () { mini.classList.remove('wiggle'); });
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { close(); return; }
      var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (t) handle(t.getAttribute('data-act'), t);
    });
    ov.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target; if (!f || !f.getAttribute || !f.getAttribute('data-form')) return;
      submitName(f.querySelector('input'));
    });
    document.addEventListener('keydown', trapKeys);
    updateMini();
  }

  function initFish(uid, remoteFish) {
    fish = mergeFish(readFish(uid), remoteFish);
    rollDay();
    fishReady = true;
    try { localStorage.setItem(fishKeyOf(uid), JSON.stringify(fish)); } catch (e) {}
    updateFishUI();
    var q = pending.splice(0); q.forEach(function (fn) { try { fn(); } catch (e) {} });
    if (ctx.canSync && JSON.stringify(fish) !== JSON.stringify(remoteFish)) persistFish();
  }

  /* ---------- chạy ---------- */
  function run() {
    build();
    var t = today();
    authCtx().then(function (c) {
      var uid = c.uid, client = c.client, local = readLocal(uid);

      var getClient = client ? Promise.resolve(client) : (uid ? lazyClient() : Promise.resolve(null));
      return getClient.then(function (cl) {
        var remoteP = cl && uid ? fetchRemote(cl, uid) : Promise.resolve({ ok: false, data: null });
        return remoteP.then(function (remote) {
          ctx.client = cl; ctx.uid = uid; ctx.canSync = !!(cl && uid && remote.ok); prefs = remote.prefs;
          initFish(uid, remote.fish);
          var base = pick(local, remote.data);
          var res = advance(base, t);
          writeLocal(uid, res.state);
          if (cl && uid && remote.ok && !sameState(res.state, remote.data)) saveRemote(cl, uid, res.state);
          return { uid: uid, res: res };
        });
      });
    }).then(function (o) {
      lastView = o.res;
      updateMini();
      updateFishUI();
      var flag = 'meow_cat_popup_' + (o.uid || 'guest') + '_' + t, shown = false;
      try { shown = !!sessionStorage.getItem(flag); } catch (e) {}
      if (!shown) {
        try { sessionStorage.setItem(flag, '1'); } catch (e) {}
        open(true);
      } else {
        mini.classList.add('wiggle');
      }
    }).catch(function () {
      if (badge) badge.textContent = '🔥';
      if (!fishReady) initFish(null, null);
    });
  }

  window.MeowCat = {
    show: function () { open(false); },
    correct: correct,
    reward: reward,
    name: function () { return catName(); },
    setName: function (n) { return fishReady ? commitName(n) : false; },
    fish: function () { return fishReady ? { balance: fishBalance(), fed: fishFedTotal(), level: levelName() } : null; },
    state: function () { return lastView ? { count: lastView.state.count, best: lastView.state.best, last: lastView.state.last } : null; }
  };

  hookTracking(0);
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
})();
