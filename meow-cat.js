/*!
 * meow-cat.js — Mèo giữ chuỗi của Tiếng Trung Meow Meow  (bản thiết kế lại v2)
 *
 * - Popup khi học viên mở web (1 lần / phiên / ngày) cho biết đã giữ chuỗi chưa.
 * - Luôn có một chú mèo nhỏ ở góc trái dưới của MỌI trang (vòng tiến độ tới món quà kế tiếp); bấm vào để mở lại.
 * - Học viên TỰ ĐẶT TÊN cho mèo (đồng bộ theo tài khoản).
 * - Tủ đồ: giữ chuỗi tới các mốc 5 · 10 · 15 · 20 · 25 · 30 · 35 · 40 · 45 · 50 · 60 · 70 · 90 · 100 · 150 · 200 · 250 · 300 ngày
 *   để mở mũ / giày / trang phục / phụ kiện / đồ cầm tay cho mèo. Quà tính theo KỶ LỤC chuỗi nên đứt chuỗi cũng không mất quà.
 * - Đổi quà (v3): dùng cá đổi 20 món (bạn đồng hành, trang sức, hoa, trái cây, sữa...) giá 5 → 50 cá, không giới hạn số lần,
 *   mỗi món đổi 1 lần rồi mặc cho mèo. Bấm vào món nào cũng hiện khung "Lịch sử ra đời" (xem LORE). Muốn sửa giá: đổi `cost` trong SHOP.
 * - Chuỗi tính theo ngày (giờ máy học viên): mở web mỗi ngày = giữ chuỗi.
 * - Thẻ đóng băng ❄: học đủ 7 ngày liên tiếp nhận 1 thẻ (tối đa 2). Vắng ngày nào thì tự dùng thẻ để cứu chuỗi.
 * - Cá 🐟: đúng 5 từ vựng +1 cá; làm đạt 1 phần bài tập (>=80%) +1 cá; thắng game (đúng 10 từ/câu) +1 cá; rồi cho mèo ăn.
 *   Trang khác muốn tặng cá thì gọi:  MeowCat.correct('khoa-duy-nhat')  hoặc  MeowCat.reward('ten-bai', diemPhanTram)  hoặc  MeowCat.gameWin('ten-game', soTuDung)
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
  var VOCAB_PER_FISH = 5;  // đúng bấy nhiêu từ vựng thì được 1 cá
  var PASS_SCORE = 80;     // điểm % tối thiểu để tính là làm đúng 1 phần bài tập
  var EX_FISH = 1;         // số cá cho mỗi phần bài tập đạt (mỗi bài hsk1/hsk2/hsk3/hsk4 tính riêng, 1 lần/ngày)
  var GAME_WIN_WORDS = 10; // chơi game: đúng đủ bấy nhiêu từ/câu trong 1 lượt thì thắng
  var GAME_FISH = 1;       // số cá cho mỗi lượt game thắng
  var FISH_VOCAB_CAP = 5;  // tối đa cá kiếm từ từ vựng mỗi ngày (5 cá = 25 từ)
  var FISH_EX_CAP = 10;    // tối đa cá kiếm từ bài tập + game mỗi ngày
  var FEED_CAP = 5;        // mèo ăn tối đa bấy nhiêu con cá mỗi ngày (no rồi thì mai ăn tiếp)
  var LEVELS = [[0, 'Meow Meow'], [10, 'Mèo ngoan'], [30, 'Mèo béo'], [80, 'Mèo Thần Tài 财神']]; // [số cá đã ăn, danh hiệu]
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

  /* ================================================================
   *  v3 — ĐỔI QUÀ BẰNG CÁ + MỐC CHUỖI DÀY HƠN + LỊCH SỬ TỪNG MÓN
   *  Thêm 6 món mốc chuỗi (5·15·25·35·45·90 ngày) và 20 món đổi bằng cá.
   * ================================================================ */
  var GRN = '#4CAF6A', GRN_D = '#2E7D4F', PINK = '#FFB6C8', PINK_D = '#C0507A', JADE = '#7FD1A8', JADE_D = '#2F7F63', TIGER = '#F5A524', DK = '#4B3A35';

  // --- hàm vẽ bổ sung ---
  function mir(inner, cx) { return '<g>' + inner + '</g><g transform="matrix(-1 0 0 1 ' + (2 * cx) + ' 0)">' + inner + '</g>'; }
  function rope(d, w) { return L(d, '#8E1224', (w || 3.4) + 2.4) + L(d, RED, w || 3.4); }
  function ring(cx, cy, rx, ry, rot, w) {
    var tf = ' transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"', b = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="none" stroke-linecap="round"' + tf;
    return b + ' stroke="' + JADE_D + '" stroke-width="' + (w + 2.6) + '"/>' + b + ' stroke="' + JADE + '" stroke-width="' + w + '"/>';
  }
  function bloom(cx, cy, r, fill, st, mid) { // hoa 5 cánh tròn (mai, đào...)
    var s = '', i, a, d = r * 0.62, pr = (r * 0.52).toFixed(1), pts = [];
    for (i = 0; i < 5; i++) { a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([(cx + d * Math.cos(a)).toFixed(1), (cy + d * Math.sin(a)).toFixed(1)]); }
    pts.forEach(function (p) { s += C(p[0], p[1], pr, fill, 2, st); });
    pts.forEach(function (p) { s += C(p[0], p[1], pr, fill, 0); });
    return s + C(cx, cy, (r * 0.3).toFixed(1), mid, 0);
  }
  function rose(cx, cy, R, c1, c2, c3, st) { // mẫu đơn nhiều lớp
    var s = '', i, a;
    for (i = 0; i < 7; i++) { a = i * 2 * Math.PI / 7; s += C((cx + R * 0.6 * Math.cos(a)).toFixed(1), (cy + R * 0.6 * Math.sin(a)).toFixed(1), (R * 0.46).toFixed(1), c1, 2.2, st); }
    s += C(cx, cy, (R * 0.64).toFixed(1), c1, 0);
    for (i = 0; i < 5; i++) { a = i * 2 * Math.PI / 5 + 0.3; s += C((cx + R * 0.26 * Math.cos(a)).toFixed(1), (cy + R * 0.26 * Math.sin(a)).toFixed(1), (R * 0.3).toFixed(1), c2, 1.6, st); }
    return s + C(cx, cy, (R * 0.15).toFixed(1), c3, 0);
  }
  function orch(cx, cy, s) { // hoa lan nhỏ
    var o = '#8A4FB0', w = '#F3E5FF';
    return E(cx, cy - 5.5 * s, 3 * s, 5.5 * s, w, 1.6, o) +
      E(cx - 5 * s, cy - 1.5 * s, 5.2 * s, 2.8 * s, w, 1.6, o, 'rotate(-25 ' + (cx - 5 * s) + ' ' + (cy - 1.5 * s) + ')') +
      E(cx + 5 * s, cy - 1.5 * s, 5.2 * s, 2.8 * s, w, 1.6, o, 'rotate(25 ' + (cx + 5 * s) + ' ' + (cy - 1.5 * s) + ')') +
      E(cx, cy + 1.5 * s, 3.4 * s, 3 * s, '#C77BD8', 1.6, o) + C(cx, cy - s, 1.1 * s, GOLD, 0);
  }
  function ffly(x, y, s) { // đom đóm
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><circle r="14" fill="#E8FF6A" opacity=".4" class="gl"/>' +
      E(-4, -6, 5.5, 3, 'rgba(255,255,255,.8)', 1.2, '#8A97B0', 'rotate(-35 -4 -6)') + E(0, 0, 7, 3.8, DK, 0) + C(-7, 0, 2.8, DK, 0) +
      C(5.5, 0, 4, '#F4FF5E', 1.2, '#A8B315') + L('M-8 -2 q-3 -4 -6 -3', DK, 1.2) + '</g>';
  }

  // --- bạn đồng hành bay (góc trên bên trái) ---
  var BFLY = '<g class="hov"><g transform="translate(-4 0)">' + mir(
      P('M28 64 C19 43 5 50 9 62 C12 68 21 68 28 64Z', '#F58FA8', 2.2) +
      P('M28 66 C21 68 11 71 14 79 C17 86 26 80 28 70Z', '#FFC27A', 2.2) +
      C(15, 57, 3, '#fff', 0) + C(19, 76, 2.3, '#fff', 0), 28) +
    E(28, 68, 2.6, 9, DK, 0) + L('M27 59 Q24 51 20 49 M29 59 Q32 51 36 49', DK, 1.7) + '</g></g>';
  var MAGPIE = '<g class="hov"><g transform="translate(-2 0)">' +
    P('M20 68 L3 80 Q3 85 8 84 L22 76Z', '#2B2B3A', 2) +
    E(28, 68, 12, 8.5, '#2B2B3A', 2.2, null, 'rotate(-12 28 68)') + E(31, 72, 7.5, 4.2, '#fff', 0, null, 'rotate(-12 31 72)') +
    P('M17 65 Q27 54 38 66 Q28 76 17 65Z', '#3B6FD8', 2) + L('M21 65 Q28 60 34 65', '#8FB4FF', 1.6) +
    L('M26 76 v6 M32 76 v6', '#E8A317', 1.8) +
    C(38, 59, 6.8, '#2B2B3A', 2.2) + P('M43 58 L49 60.5 L43 62.5Z', '#F2B632', 1.6, GOLD_D) + C(39.5, 57.5, 1.7, '#fff', 0) + C(40, 57.5, 0.8, '#2B1A17', 0) +
    '</g></g>';
  var FIREFLY = '<g class="hov">' + ffly(15, 62, 1) + ffly(33, 80, 0.85) + ffly(14, 95, 0.75) + star(32, 52, 4, '#F4FF5E') + '</g>';
  var SPIDER = '<g class="dng">' + L('M22 -6 V54', '#B8A894', 1.6) +
    mir(L('M17 63 Q8 57 4 65 M16.5 66 Q6 65 4 75 M17.5 69 Q8 74 7 84 M19 71 Q14 80 12 89', DK, 1.9), 22) +
    E(22, 67, 8.5, 7.5, DK, 2) + C(22, 56, 5.2, DK, 2) + C(19.8, 55, 1.5, '#fff', 0) + C(24.2, 55, 1.5, '#fff', 0) +
    TX(22, 70.4, 9, GOLD, '喜') + '</g>';

  // --- bạn đồng hành bò (góc dưới bên trái) ---
  var TURTLE =
    P('M6 219 L1 222 L7 223Z', '#8FD18F', 1.8) + E(46, 213, 6.2, 5.4, '#8FD18F', 2.2) + C(48, 211.5, 1.4, '#2B1A17', 0) +
    E(13, 226, 5.2, 3.6, '#8FD18F', 2.2) + E(35, 226, 5.2, 3.6, '#8FD18F', 2.2) +
    P('M6 226 Q6 196 24 196 Q42 196 42 226Z', '#5FAE6B', 2.6) +
    L('M24 198 V225 M12 207 Q24 214 36 207 M9 218 Q24 224 39 218', GRN_D, 1.8) + E(24, 226, 18, 2.6, '#E8D8A8', 2);
  var CRICKET =
    L('M14 220 L6 210 L3 225 M21 224 L15 231 L8 231', '#6B4A2A', 2.4) +
    E(22, 218, 14, 7.5, '#9A6A3A', 2.2) + P('M10 216 Q22 205 34 216 Q22 222 10 216Z', '#B88650', 1.8) + L('M14 215.5 Q22 210 30 215.5', '#7A5430', 1.2) +
    L('M30 224 L32 231 M37 222 L40 229', '#6B4A2A', 2.2) +
    C(38, 213, 6, '#9A6A3A', 2.2) + C(40.3, 211.5, 1.9, '#fff', 0) + C(40.8, 211.6, 0.9, '#2B1A17', 0) +
    L('M40 208 Q45 199 50 198 M37 208 Q37 199 42 194', '#6B4A2A', 1.6);
  var SILK =
    P('M0 229 Q12 218 30 224 Q18 234 0 229Z', '#6DBE6A', 2) + L('M3 229 Q16 224 28 225', GRN_D, 1.2) +
    C(10, 222, 6.2, '#FFFBF0', 2.2) + C(20, 219.5, 6.8, '#FFFBF0', 2.2) + C(30, 216, 7, '#FFFBF0', 2.2) + C(38, 208, 7.2, '#FFFBF0', 2.2) +
    C(42, 199, 7.2, '#FFF3E0', 2.2) + C(39.5, 198, 1.4, '#2B1A17', 0) + C(45, 198, 1.4, '#2B1A17', 0) + L('M40.5 202 Q42.5 204 44.5 202', DK, 1.4) +
    L('M20 213 q-1.5 3 0 6.5 M30 209 q-1.5 3.5 0 7', '#D9C9B0', 1.2);
  var TOAD =
    E(26, 228.5, 19, 3.4, '#E8A317', 2, GOLD_D) + E(26, 225.5, 19, 3.4, GOLD, 2, GOLD_D) +
    E(10, 219, 7, 5, '#E8A317', 2.2, GOLD_D) +
    E(24, 213, 16, 12.5, GOLD, 2.4, GOLD_D) + E(26, 218, 9, 6, '#FFE08A', 0) +
    C(16, 208, 2.2, '#C48A00', 0) + C(23, 204, 2, '#C48A00', 0) + C(17, 215, 1.8, '#C48A00', 0) +
    E(34, 222, 5, 4, '#E8A317', 2.2, GOLD_D) +
    C(31, 200, 4.4, '#fff', 2, GOLD_D) + C(40, 203, 4.4, '#fff', 2, GOLD_D) + C(32.2, 200.5, 2, '#2B1A17', 0) + C(41.2, 203.5, 2, '#2B1A17', 0) +
    L('M30 212 Q38 217 44 211', GOLD_D, 1.8) +
    C(46, 214.5, 6, '#FFD25E', 1.8, GOLD_D) + P('M44 212.5 h4 v4 h-4z', CREAM, 1.2, GOLD_D);

  // --- món ngon (bên phải, dưới đất) ---
  var BOWL = P('M150 219 Q152 233 174 233 Q196 233 198 219Z', '#fff', 2.4) + L('M155 225 Q174 232 193 225', RED, 2.2) + E(174, 219, 24, 4.5, '#fff', 2.4);
  var ORANGES = BOWL +
    C(165, 212, 8, '#FF9F2E', 2.2, '#B35F00') + C(183, 212, 8, '#FF9F2E', 2.2, '#B35F00') + C(174, 204, 8, '#FFAD3D', 2.2, '#B35F00') +
    E(161, 209, 2.4, 1.6, 'rgba(255,255,255,.55)', 0) + E(179, 209, 2.4, 1.6, 'rgba(255,255,255,.55)', 0) +
    TX(174, 207.4, 9, '#7A3300', '吉') + P('M174 196.5 Q179 189 186 192 Q182 198 174 196.5Z', '#4CAF50', 1.4, GRN_D);
  var SOYMILK =
    L('M165 207 q-5 -6 0 -12 q5 -6 0 -12 M176 205 q-5 -6 0 -12 q5 -6 0 -12 M187 207 q-5 -6 0 -12 q5 -6 0 -12', '#D6C6B4', 2.2) +
    L('M188 222 L199 198', '#D9902F', 6.4) + L('M188 222 L199 198', '#F2C26A', 3.2) +
    BOWL + E(174, 219, 19.5, 3.2, '#FFF4D6', 1.4, '#D9B97A');
  var PEACH =
    E(174, 228.5, 24, 4.2, GOLD, 2.2, GOLD_D) + E(174, 227, 19, 2.6, '#FFE08A', 0) +
    P('M174 198 C158 192 150 212 164 222 Q174 227 184 222 C198 212 190 192 174 198Z', '#FFB3AE', 2.4, PINK_D) +
    E(184, 211, 4.5, 7.5, '#FF8A8A', 0, null, 'rotate(18 184 211)') +
    P('M174 198 Q180 188 193 190 Q189 201 174 198Z', '#6DBE6A', 2, GRN_D) + TX(172, 217, 12.5, '#C8102E', '寿');
  var TANGHULU = L('M176 182 V232', '#D9B27A', 3) +
    C(176, 223, 7.5, '#E8344E', 2, '#8E1224') + C(176, 210, 7.5, '#E8344E', 2, '#8E1224') + C(176, 197, 7.5, '#E8344E', 2, '#8E1224') +
    E(173.4, 194.5, 2.6, 1.7, 'rgba(255,255,255,.75)', 0, null, 'rotate(-30 173.4 194.5)') +
    E(173.4, 207.5, 2.6, 1.7, 'rgba(255,255,255,.75)', 0, null, 'rotate(-30 173.4 207.5)') +
    E(173.4, 220.5, 2.6, 1.7, 'rgba(255,255,255,.75)', 0, null, 'rotate(-30 173.4 220.5)');

  // --- cầm tay: bàn chân cầm ở (152,177) ---
  var GRIP = E(152, 177, 10, 8.5, CREAM, 2.6) + L('M148 174.5 v4 M152 173.5 v5 M156 174.5 v4', OL, 1.6);
  var PLUM = L('M152 176 Q146 152 158 134', '#7A4A32', 3.4) + L('M149 156 Q160 152 168 142', '#7A4A32', 2.6) + L('M155 142 Q148 134 144 128', '#7A4A32', 2.2) +
    bloom(158, 131, 8.5, PINK, PINK_D, GOLD) + bloom(168, 141, 7, '#FFD0DC', PINK_D, GOLD) + bloom(144, 127, 6.5, PINK, PINK_D, GOLD) +
    C(151, 150, 2.6, '#E8607F', 0) + C(157, 146, 2.2, '#E8607F', 0);
  var LOTUS = L('M152 176 Q150 156 152 142', GRN, 3.6) +
    P('M152 171 Q170 156 185 166 Q170 179 152 173Z', '#6DBE6A', 2.2, GRN_D) + L('M155 171 Q168 165 180 167', GRN_D, 1.2) +
    P('M152 146 Q137 140 137 124 Q150 127 155 143Z', PINK, 2.2, PINK_D) + P('M152 146 Q167 140 167 124 Q154 127 149 143Z', PINK, 2.2, PINK_D) +
    P('M152 148 Q141 134 152 117 Q163 134 152 148Z', '#FF8FB0', 2.2, PINK_D) + E(152, 148, 7, 2.6, GOLD, 0);
  var PEONY = L('M152 176 Q150 162 152 150', GRN, 3.4) +
    P('M151 170 Q137 161 133 169 Q142 178 151 172Z', GRN, 2, GRN_D) + P('M153 165 Q167 155 172 163 Q164 173 153 167Z', GRN, 2, GRN_D) +
    rose(152, 138, 18, '#E8506A', '#FF8FA3', GOLD, '#A8283E');
  var ORCHID = L('M152 176 Q144 150 124 142', '#3F9B5A', 3.6) + L('M152 176 Q156 146 178 134', '#3F9B5A', 3.6) + L('M152 176 Q150 146 144 118', GRN, 3.2) +
    L('M152 174 Q158 152 163 136', '#7A8A3A', 2.2) + orch(163, 131, 1.2) + orch(159, 148, 1) + orch(167, 118, 0.9);
  var LANTERN = L('M148 176 V116 Q148 109 158 109', '#8B5A2B', 3.2) + L('M158 109 V120', '#8B5A2B', 1.8) +
    P('M146 120 h24 v5 h-24z', GOLD, 2, GOLD_D) + E(158, 140, 16, 14.5, RED, 2.4, '#8E1224') +
    L('M158 126 V154', '#8E1224', 1.4) + E(158, 140, 8, 14.5, 'none', 1.4, '#8E1224') +
    P('M147 153 h22 v4 h-22z', GOLD, 2, GOLD_D) + L('M158 157 V167', '#F2B632', 2.4) + P('M154 167 h8 l1 8 h-10z', RED, 1.4, '#8E1224') +
    TX(158, 145, 12, GOLD, '福');
  var FAN = P('M149 172 h6 v9 h-6z', '#8B5A2B', 1.6) +
    P('M152 172 L117.4 152 A40 40 0 0 1 186.6 152Z', CREAM, 2.4, '#8E1224') +
    L('M152 172 L117.4 152 M152 172 L132 137.4 M152 172 L152 132 M152 172 L172 137.4 M152 172 L186.6 152', '#C8102E', 1.5) +
    L('M117.4 152 A40 40 0 0 1 186.6 152', GOLD, 3) + bloom(152, 148, 7, PINK, PINK_D, GOLD);

  // --- trang sức ---
  var JADE_CORD = L('M70 130 Q100 168 130 130', RED, 2.6);
  var PENDANT = JADE_CORD + L('M100 149 V161', RED, 2.4) +
    C(100, 172, 11.5, JADE, 2.4, JADE_D) + C(100, 172, 4.2, CREAM, 1.8, JADE_D) + L('M91.5 168 Q93.5 163 98.5 161', '#E8FFF3', 2) +
    L('M100 183.5 V190', RED, 2) + P('M96 190 h8 l1.5 10 h-11z', RED, 1.4, '#8E1224');
  var KNOT = rope('M70 130 Q100 168 130 130', 2.6) + rope('M100 149 V155', 2.4) +
    rope('M100 155 L112 168 L100 181 L88 168Z', 3) + rope('M100 162 L106 168 L100 174 L94 168Z', 2.4) + C(100, 168, 2.6, GOLD, 1.2, GOLD_D) +
    L('M100 181 V191', '#8E1224', 5) + L('M100 181 V191', RED, 2.6) + P('M94 191 h12 l2 14 h-16z', RED, 1.6, '#8E1224') + L('M97 196 v8 M100 196 v9 M103 196 v8', '#FFB0B8', 1);
  var BANGLE = mir(ring(63, 164, 12.5, 4.8, 8, 4.4), 100);
  var BUYAO = L('M140 57 Q135 74 137 90', '#E8A317', 1.6) + C(137, 92, 3, '#fff', 1.2, GOLD_D) +
    L('M143 60 Q143 78 145 98', '#E8A317', 1.6) + C(145, 100, 3.2, JADE, 1.2, JADE_D) +
    L('M148 57 Q153 73 152 88', '#E8A317', 1.6) + C(152, 90, 2.8, '#fff', 1.2, GOLD_D) +
    bloom(143, 51, 9, '#FFD25E', GOLD_D, RED);

  // --- món mốc chuỗi mới ---
  var HAT4 = // mũ đầu hổ
    C(70, 27, 9.5, TIGER, 2.6) + C(70, 28, 4.6, '#FFB0B8', 0) + C(130, 27, 9.5, TIGER, 2.6) + C(130, 28, 4.6, '#FFB0B8', 0) +
    P('M62 58 Q60 22 100 18 Q140 22 138 58 Q100 48 62 58Z', TIGER, 3) +
    L('M82 24 L85 39 M118 24 L115 39 M71 34 L76 44 M129 34 L124 44', DK, 3.4) + TX(100, 38.5, 14, DK, '王') +
    P('M60 52 Q100 40 140 52 L141 63 Q100 52 59 63Z', '#FFF3E0', 2.5);
  var SHOE4 = pair( // giày đầu hổ
    P(SHOE, TIGER) + P(SOLE, '#FFF8EE', 2) + L('M72 201 v5 M78 200.5 v6 M84 201 v5', DK, 2.2) + C(66, 202, 4, TIGER, 2) + C(90, 202, 4, TIGER, 2) +
    C(71, 209, 2.6, '#fff', 1.2) + C(85, 209, 2.6, '#fff', 1.2) + C(71, 209.4, 1.2, '#2B1A17', 0) + C(85, 209.4, 1.2, '#2B1A17', 0) +
    P('M75 214 h6 l-3 3.4z', '#E5758B', 1.2) + L('M78 217.4 v2 M74 220 Q78 222 82 220', DK, 1.4));
  var OUTFIT4 = // yếm đỗ đâu
    L('M78 140 Q100 128 122 140', GOLD, 3.2) +
    P('M80 138 L120 138 L128 168 Q126 194 100 206 Q74 194 72 168Z', '#E8344E', 3) +
    '<path d="M84 145 L116 145 L121 168 Q119 187 100 197 Q81 187 79 168Z" fill="none" stroke="#FFD25E" stroke-width="2" stroke-dasharray="3 3" stroke-linecap="round"/>' +
    TX(100, 176, 17, GOLD, '福');
  var LOCK = L('M70 130 Q100 168 130 130', GOLD, 3.4) + L('M93 161 Q93 150 100 150 Q107 150 107 161', GOLD_D, 3.4) +
    P('M86 160 h28 q4 0 4 4 v18 q0 4 -4 4 h-28 q-4 0 -4 -4 v-18 q0 -4 4 -4z', GOLD, 2.4, GOLD_D) +
    TX(100, 173.5, 10, RED, '长命') + TX(100, 184, 9, RED, '百岁') +
    L('M90 190 v8 M100 190 v10 M110 190 v8', RED, 2.2);

  var SLOTS = { h: 'Mũ', s: 'Giày', o: 'Trang phục', a: 'Phụ kiện', j: 'Trang sức tóc', n: 'Trang sức đeo', f: 'Cầm tay', m: 'Món ngon', k: 'Bạn bay', g: 'Bạn bò' };
  var SLOT_ORDER = ['h', 's', 'o', 'a', 'j', 'n', 'f', 'm', 'k', 'g'];
  var SLOT_CAT = { h: 'wear', s: 'wear', o: 'wear', a: 'wear', j: 'jewel', n: 'jewel', f: 'hold', m: 'food', k: 'pet', g: 'pet' };
  var CATS = [['all', 'Tất cả'], ['wear', 'Quần áo'], ['jewel', 'Trang sức'], ['hold', 'Hoa & cầm tay'], ['food', 'Ăn uống'], ['pet', 'Bạn đồng hành']];
  var SOLO = { f: 1, m: 1, k: 1, g: 1 }; // món vẽ riêng (không kèm mèo) ở ảnh nhỏ
  var VB = { h: '20 0 160 112', s: '38 190 124 42', o: '28 112 144 108', a: '0 0 200 232', j: '92 20 98 96', n: '48 120 104 90', f: '112 104 86 78', m: '142 184 58 48', k: '0 38 54 62', g: '0 190 56 42' };

  // Quà theo mốc chuỗi (xếp theo ngày)
  var ITEMS = [
    { id: 'f1', slot: 'f', day: 5,   name: 'Đèn lồng đỏ',         zh: '红灯笼',   py: 'hóng dēnglong',     svg: LANTERN, vb: '128 100 62 82', nw: 1 },
    { id: 'h1', slot: 'h', day: 10,  name: 'Mũ len đỏ',           zh: '红毛线帽', py: 'hóng máoxiàn mào', svg: HAT1 },
    { id: 'h4', slot: 'h', day: 15,  name: 'Mũ đầu hổ',           zh: '虎头帽',   py: 'hǔtóu mào',         svg: HAT4, nw: 1 },
    { id: 's1', slot: 's', day: 20,  name: 'Giày vải đỏ',         zh: '红布鞋',   py: 'hóng bùxié',        svg: SHOE1 },
    { id: 'o4', slot: 'o', day: 25,  name: 'Yếm đỗ đâu',          zh: '肚兜',     py: 'dùdōu',             svg: OUTFIT4, nw: 1 },
    { id: 'o1', slot: 'o', day: 30,  name: 'Áo Đường trang',      zh: '唐装',     py: 'tángzhuāng',        svg: OUTFIT1 },
    { id: 's4', slot: 's', day: 35,  name: 'Giày đầu hổ',         zh: '虎头鞋',   py: 'hǔtóu xié',         svg: SHOE4, nw: 1 },
    { id: 'a1', slot: 'a', day: 40,  name: 'Kính tròn',           zh: '圆框眼镜', py: 'yuánkuàng yǎnjìng', svg: GLASSES, layer: 'post', vb: '30 56 140 84' },
    { id: 'f2', slot: 'f', day: 45,  name: 'Quạt giấy',           zh: '折扇',     py: 'zhéshàn',           svg: FAN, vb: '110 126 86 60', nw: 1 },
    { id: 'h2', slot: 'h', day: 50,  name: 'Mũ Trạng Nguyên',     zh: '状元帽',   py: 'zhuàngyuán mào',    svg: HAT2, vb: '6 0 188 112' },
    { id: 's2', slot: 's', day: 60,  name: 'Giày thêu vàng',      zh: '金绣鞋',   py: 'jīn xiù xié',       svg: SHOE2 },
    { id: 'o2', slot: 'o', day: 70,  name: 'Hán phục ngọc bích',  zh: '汉服',     py: 'hànfú',             svg: OUTFIT2 },
    { id: 'n1', slot: 'n', day: 90,  name: 'Khoá trường mệnh',    zh: '长命锁',   py: 'chángmìng suǒ',     svg: LOCK, vb: '56 124 88 84', nw: 1 },
    { id: 'a2', slot: 'a', day: 100, name: 'Chuông vàng may mắn', zh: '金铃铛',   py: 'jīn língdang',      svg: BELL, layer: 'pre', vb: '30 100 140 90' },
    { id: 'h3', slot: 'h', day: 150, name: 'Vương miện vàng',     zh: '金皇冠',   py: 'jīn huángguān',     svg: HAT3 },
    { id: 's3', slot: 's', day: 200, name: 'Giày mây cát tường',  zh: '祥云鞋',   py: 'xiángyún xié',      svg: SHOE3 },
    { id: 'o3', slot: 'o', day: 250, name: 'Long bào hoàng kim',  zh: '龙袍',     py: 'lóngpáo',           svg: OUTFIT3 },
    { id: 'a3', slot: 'a', day: 300, name: 'Hào quang Thần Tài',  zh: '财神光环', py: 'cáishén guānghuán', svg: INGOT, back: HALO, layer: 'pre', vb: '0 0 200 232' }
  ];
  // Quà đổi bằng cá: cost = số cá, giá tăng dần (muốn đổi giá/đổi món chỉ cần sửa tại đây)
  var SHOP = [
    { id: 'x01', slot: 'k', cost: 5,  name: 'Bướm hoa',             zh: '蝴蝶',     py: 'húdié',          svg: BFLY, vb: '0 40 52 56' },
    { id: 'x02', slot: 'm', cost: 5,  name: 'Quýt cát tường',       zh: '橘子',     py: 'júzi',           svg: ORANGES, vb: '142 186 58 48' },
    { id: 'x03', slot: 'g', cost: 10, name: 'Rùa trường thọ',       zh: '乌龟',     py: 'wūguī',          svg: TURTLE, vb: '0 192 56 40' },
    { id: 'x04', slot: 'f', cost: 10, name: 'Hoa mai',              zh: '梅花',     py: 'méihuā',         svg: PLUM, vb: '126 112 56 70' },
    { id: 'x05', slot: 'k', cost: 15, name: 'Chim hỉ thước',        zh: '喜鹊',     py: 'xǐquè',          svg: MAGPIE, vb: '0 46 52 48' },
    { id: 'x06', slot: 'm', cost: 15, name: 'Sữa đậu nành',         zh: '豆浆',     py: 'dòujiāng',       svg: SOYMILK, vb: '142 178 62 56' },
    { id: 'x07', slot: 'n', cost: 20, name: 'Ngọc bội',             zh: '玉佩',     py: 'yùpèi',          svg: PENDANT, vb: '56 124 88 84' },
    { id: 'x08', slot: 'f', cost: 20, name: 'Hoa sen',              zh: '荷花',     py: 'héhuā',          svg: LOTUS, vb: '128 112 62 70' },
    { id: 'x09', slot: 'g', cost: 25, name: 'Dế mèn',               zh: '蟋蟀',     py: 'xīshuài',        svg: CRICKET, vb: '0 190 56 44' },
    { id: 'x10', slot: 'm', cost: 25, name: 'Đào thọ',              zh: '寿桃',     py: 'shòutáo',        svg: PEACH, vb: '146 184 56 50' },
    { id: 'x11', slot: 'f', cost: 30, name: 'Hoa mẫu đơn',          zh: '牡丹',     py: 'mǔdān',          svg: PEONY, vb: '126 112 60 70' },
    { id: 'x12', slot: 'k', cost: 30, name: 'Đom đóm',              zh: '萤火虫',   py: 'yínghuǒchóng',   svg: FIREFLY, vb: '0 40 52 66' },
    { id: 'x13', slot: 'n', cost: 35, name: 'Nút thắt Trung Hoa',   zh: '中国结',   py: 'zhōngguó jié',   svg: KNOT, vb: '56 124 88 88' },
    { id: 'x14', slot: 'm', cost: 35, name: 'Kẹo hồ lô',            zh: '糖葫芦',   py: 'tánghúlu',       svg: TANGHULU, vb: '152 180 48 54' },
    { id: 'x15', slot: 'k', cost: 40, name: 'Nhện hỉ',              zh: '喜蛛',     py: 'xǐzhū',          svg: SPIDER, vb: '0 20 46 80' },
    { id: 'x16', slot: 'g', cost: 40, name: 'Tằm tơ',               zh: '蚕',       py: 'cán',            svg: SILK, vb: '0 190 54 44' },
    { id: 'x17', slot: 'f', cost: 45, name: 'Hoa lan',              zh: '兰花',     py: 'lánhuā',         svg: ORCHID, vb: '118 106 66 76' },
    { id: 'x18', slot: 'j', cost: 45, name: 'Trâm bộ dao',          zh: '步摇',     py: 'bùyáo',          svg: BUYAO, vb: '100 32 70 78' },
    { id: 'x19', slot: 'g', cost: 50, name: 'Cóc vàng chiêu tài',   zh: '金蟾',     py: 'jīnchán',        svg: TOAD, vb: '0 192 58 40' },
    { id: 'x20', slot: 'n', cost: 50, name: 'Vòng ngọc',            zh: '玉镯',     py: 'yùzhuó',         svg: BANGLE, vb: '36 140 128 50' }
  ];
  ITEMS.sort(function (a, b) { return a.day - b.day; });
  SHOP.sort(function (a, b) { return a.cost - b.cost; });
  var ALL = ITEMS.concat(SHOP);
  var IDX = {};
  ALL.forEach(function (it) { it.solo = !!SOLO[it.slot]; IDX[it.id] = it; });
  function byId(id) { return Object.prototype.hasOwnProperty.call(IDX, id) ? IDX[id] : null; }

  /* ---------- LỊCH SỬ RA ĐỜI của từng món (hiện trong khung khi bấm vào món đồ) ----------
   * lore(id, thời kỳ, [đoạn 1, đoạn 2...], ý nghĩa, "bạn có biết")
   * Nhiều chi tiết là truyền thuyết dân gian nên có ghi rõ "tương truyền" / "được cho là". */
  var LORE = {};
  function lore(id, era, ps, mean, fact) { LORE[id] = { era: era, ps: ps, mean: mean, fact: fact || '' }; }

  /* --- quà theo mốc chuỗi --- */
  lore('f1', 'Từ thời Hán · thịnh hành Đường–Tống', [
    'Đèn lồng đỏ (红灯笼, hóng dēnglong) gắn với Tết Nguyên Tiêu (rằm tháng Giêng), ngày hội đèn lớn nhất của người Trung Hoa. Tương truyền Hán Minh Đế (thế kỷ 1) khuyến khích thắp đèn đêm rằm tháng Giêng theo tập tục Phật giáo; sang thời Đường–Tống, hội đèn rất thịnh vượng và đèn được làm ra đủ hình, đủ sắc.',
    'Khung đèn làm bằng tre, bọc lụa hoặc giấy, thắp bằng nến. Dịp Tết, nhà nhà treo đèn đỏ trước cửa để đón năm mới, xua vận xui và cầu sum vầy. Trò "đoán đố đèn" (猜灯谜, cāi dēngmí) - giải câu đố viết trên đèn - là nét vui không thể thiếu của ngày hội.'
  ], 'Ánh sáng ấm áp, sum vầy và một năm hanh thông.',
  'Rằm tháng Giêng người Trung Quốc ăn bánh trôi nước nhân mè (汤圆, tāngyuán), tượng trưng cho sự đoàn viên.');

  lore('h1', 'Truyền thống dân gian · màu đỏ cát tường', [
    'Màu đỏ (红, hóng) là sắc màu may mắn nhất của người Trung Hoa. Từ xa xưa, người ta gắn màu đỏ với lửa và mặt trời, những thứ xua đuổi bóng tối. Truyền thuyết về quái thú Niên (年) kể rằng nó sợ màu đỏ, lửa và tiếng nổ, nên cuối năm nhà nhà dán câu đối đỏ, treo đèn đỏ, đốt pháo để đuổi nó đi. Đó là gốc của tục dùng đồ đỏ ngày Tết.',
    'Chiếc mũ len đỏ là một biến thể gần gũi: người Trung Hoa tin rằng vào năm tuổi của mình (本命年, běnmìngnián) nên mặc hoặc đeo thứ gì đó màu đỏ như mũ, khăn, dây lưng, tất để "hoá giải vận xui". Len đan tay do bà, mẹ làm còn gửi gắm cả sự ấm áp và lời chúc bình an.'
  ], 'Đỏ là may mắn, bình an, hưng vượng; mũ đỏ chúc bạn một chặng học suôn sẻ.',
  'Chữ 红 (hóng) còn có nghĩa "nổi tiếng, đắt khách": người nổi tiếng gọi là 红人 (hóngrén).');

  lore('h4', 'Dân gian miền Bắc · lưu truyền nhiều thế kỷ', [
    'Mũ đầu hổ (虎头帽, hǔtóumào) là món đồ thủ công truyền thống dành cho trẻ nhỏ ở miền Bắc Trung Quốc, nổi tiếng ở các vùng như Thiểm Tây, Sơn Tây, Hà Nam. Người bà, người mẹ tự tay thêu từng mũi chỉ: đôi mắt tròn, bộ ria và chữ "Vương" (王) trên trán, vì các vằn trên trán hổ trông giống chữ này.',
    'Nguồn gốc của mũ và giày đầu hổ chưa rõ, chỉ có nhiều truyền thuyết dân gian (mũ hổ của võ sĩ đã thấy trong mộ đời Đường, còn mũ hổ cho trẻ nhỏ phong phú dần đến đời Thanh); điều chắc chắn là người xưa xem hổ là chúa sơn lâm, đủ sức trấn áp tà ma. Đội mũ hổ, đi giày hổ là cách gửi gắm ước nguyện cho con khoẻ mạnh, dũng cảm, lớn nhanh như hổ con. Ngày nay, nghề thêu đồ hổ vẫn được nhiều nơi gìn giữ như một nghề thủ công dân gian.'
  ], 'Mạnh khoẻ, dũng cảm, được che chở bình an.',
  'Thành ngữ 虎头虎脑 (hǔtóu hǔnǎo) dùng để khen một đứa bé khoẻ khoắn, đáng yêu.');

  lore('s1', 'Thủ công truyền thống · hàng trăm năm', [
    'Giày vải (布鞋, bùxié) là loại giày bình dân nhất của người Trung Hoa xưa nay. Đặc sắc nhất là kiểu đế nghìn lớp (千层底, qiāncéngdǐ): người thợ, thường là phụ nữ trong nhà, dán chồng nhiều lớp vải vụn, phơi khô rồi khâu bằng từng mũi chỉ dày, nên đế vừa êm vừa bền. "Nghìn lớp" là cách nói phóng đại cho thật nhiều lớp.',
    'Giày đỏ dành cho dịp vui: cô dâu mang giày đỏ trong lễ cưới, người đến năm bổn mệnh cũng mang giày đỏ cho may. Ở nhiều vùng, người mẹ còn khâu giày cho con trước khi con đi xa, gợi nhớ bài thơ "Du tử ngâm" của Mạnh Giao đời Đường nói về sợi chỉ trong tay người mẹ hiền.'
  ], 'Mỗi bước đi vững vàng, nhiều niềm vui.',
  'Một số nghề làm giày vải truyền thống của Trung Quốc đã được đưa vào danh mục di sản văn hoá phi vật thể.');

  lore('o4', 'Tiền thân từ thời Hán · phổ biến Minh–Thanh', [
    'Đỗ đâu (肚兜, dùdōu) là chiếc yếm hình thoi che ngực và bụng, buộc bằng dây quanh cổ và eo. Những dạng áo lót che ngực bụng đã có từ thời Hán (gọi là bão phúc 抱腹), thời Đường có "ha tử" (诃子); kiểu đỗ đâu quen thuộc phổ biến từ đời Minh, còn tên "đỗ đâu" thì được dùng từ đời Thanh. Chưa có ghi chép đáng tin về nguồn gốc chính xác của nó. Với trẻ nhỏ, đỗ đâu giữ ấm bụng, tránh cảm lạnh.',
    'Đỗ đâu trẻ em thường thêu các hình cát tường như cá chép, hoa sen, hổ, hoặc "ngũ độc" (rắn, bọ cạp, rết, cóc, thạch sùng). Theo quan niệm cổ, mặc đỗ đâu ngũ độc dịp Tết Đoan Ngọ là "lấy độc trị độc", tránh bệnh tật mùa hè.'
  ], 'Bình an, ấm áp, được che chở.',
  'Tết Đoan Ngọ (mùng 5 tháng 5 âm lịch) còn là ngày ăn bánh ú (粽子, zòngzi) và đua thuyền rồng.');

  lore('o1', 'Cuối nhà Thanh → năm 2001', [
    'Dù mang tên "Đường", kiểu áo này không có từ thời nhà Đường. Dạng cổ đứng, cài khuy vải (盘扣, pánkòu) của nó phát triển từ áo mã quái (马褂, mǎguà) của người Mãn thời nhà Thanh. Người Hoa ở hải ngoại vốn tự gọi mình là "Đường nhân" (唐人), nên trang phục kiểu Trung Hoa được gọi là Đường trang.',
    'Tên gọi này nổi tiếng toàn cầu năm 2001, khi các nhà lãnh đạo dự hội nghị APEC ở Thượng Hải cùng mặc áo Đường trang bằng gấm. Từ đó nó trở thành lễ phục ngày Tết, cưới hỏi, mừng thọ; màu đỏ, vàng, hoa văn "thọ" và "phúc" được ưa chuộng nhất.'
  ], 'Mặc Đường trang đỏ đầu năm để đón tài lộc và sum vầy.',
  'Mỗi chiếc khuy vải 盘扣 thắt thành hình bướm, hoa mai hay chữ "phúc" đều gửi một lời chúc.');

  lore('s4', 'Dân gian · quà tặng cho em bé', [
    'Giày đầu hổ (虎头鞋, hǔtóuxié) là đôi giày vải nhỏ xíu của em bé, mũi giày thêu hình mặt hổ với mắt tròn, mũi và ria. Theo tục lệ nhiều vùng miền Bắc, bà nội hoặc bà ngoại làm giày tặng cháu vào dịp đầy tháng, trăm ngày hay thôi nôi.',
    'Người ta tin giày hổ giúp bé "đi vững", gan dạ và tránh xa tà khí. Đôi giày không chỉ giữ ấm mà còn chứa đựng tình thương và tay nghề của những người lớn trong nhà, nên nhiều gia đình cất giữ như kỷ vật.'
  ], 'Bước chân vững vàng, mạnh mẽ như hổ con.',
  'Lễ "trăm ngày" (百日, bǎirì) của bé là dịp cả nhà họp mặt để chúc phúc cho con.');

  lore('a1', 'Du nhập khoảng thời Minh (thế kỷ 15–16)', [
    'Kính đeo mắt được phát minh ở châu Âu vào khoảng cuối thế kỷ 13. Kính từ phương Tây được nhập vào Trung Hoa chủ yếu thời nhà Minh, có thể qua các đoàn triều cống đầu thế kỷ 15 hoặc qua Malacca (chưa có bằng chứng chắc chắn cho thuyết kính đã đến từ đời Nguyên); người Trung Hoa gọi nó là 靉靆 (àidài), một tên đã thấy trong sách đời Tống nên các học giả vẫn còn bàn về thời điểm kính thật sự du nhập. Lúc đầu đây là món đồ hiếm và đắt của quan lại, văn nhân.',
    'Gọng tròn từ đó gắn với hình ảnh thư sinh chăm đọc sách và đến nay vẫn là "biểu tượng của người học giỏi". Mèo đeo kính tròn trông rất đúng chất một nhà thông thái đang ôn từ vựng!'
  ], 'Chăm chỉ, sáng suốt, thông tuệ.',
  'Trong tiếng Trung, kính mắt là 眼镜 (yǎnjìng), nghĩa đen là "gương của mắt".');

  lore('f2', 'Du nhập khoảng thời Tống · thịnh hành thời Minh', [
    'Quạt tròn (团扇) có ở Trung Hoa từ rất sớm. Nguồn gốc quạt xếp (折扇, zhéshàn) còn tranh luận: nhiều nghiên cứu cho rằng nó từ Nhật Bản (và Cao Ly) truyền sang đầu thời Bắc Tống (năm 988 có sư Nhật dâng quạt), số khác cho rằng Trung Hoa đã có từ thời Nam–Bắc triều. Quạt xếp thịnh hành nhất thời Minh: Minh Thành Tổ (Vĩnh Lạc) thích quạt xếp và cho thợ làm theo, nên quan lại, văn nhân đua nhau dùng.',
    'Mặt quạt thường được vẽ tranh thuỷ mặc hoặc viết thư pháp, nên quạt vừa để dùng vừa là tác phẩm nghệ thuật, là món quà giữa bạn bè. Chữ 扇 (shàn) đọc giống 善 (shàn, lương thiện) nên chiếc quạt còn gợi ý về lòng nhân hậu.'
  ], 'Phong nhã, thanh tao, mang gió mát cho những ngày học nóng bức.',
  'Hình ảnh "thư sinh áo dài phe phẩy quạt" là hình mẫu quen thuộc của văn nhân trong phim cổ trang.');

  lore('h2', 'Khoa cử Tùy–Đường–Tống (thế kỷ 7–13)', [
    'Trạng Nguyên (状元, zhuàngyuán) là danh hiệu của người đỗ đầu kỳ thi cao nhất trong chế độ khoa cử (đời Đường là kỳ thi tỉnh/hội, đời Tống là kỳ thi Đình). Người được ghi nhận là Trạng Nguyên đầu tiên là Tôn Phục Già (孙伏伽), khoảng năm 622 đời Đường. Khoa cử khởi đầu từ thời nhà Tùy (khoảng năm 605), được thực hiện bài bản dưới nhà Đường và mở rộng dưới nhà Tống, trở thành con đường chính để ra làm quan. Danh xưng "Trạng Nguyên" phổ biến từ đời Đường, còn vòng thi cuối do chính hoàng đế giám sát thành nền nếp từ năm 973 đời Tống.',
    'Chiếc mũ có hai cánh dài hai bên là kiểu mũ phốc đầu cánh ngang (展脚幞头, zhǎnjiǎo fútóu) của quan lại đời Tống. Tương truyền cánh mũ dài để các quan đứng chầu không thể thì thầm với nhau. Khi đỗ, Trạng Nguyên đội mũ, cài hoa, cưỡi ngựa diễu hành qua phố trong tiếng reo hò của dân chúng.'
  ], 'Học giỏi, thi đỗ, vinh quy bái tổ.',
  'Thành ngữ 金榜题名 (jīnbǎng tímíng) - "tên đề bảng vàng" - dùng để chúc thi đỗ, rất hợp để chúc bạn thi HSK.');

  lore('s2', 'Nghề thêu cổ · hơn 2000 năm', [
    'Thêu (刺绣, cìxiù) là nghề thủ công cổ của Trung Hoa, có dấu vết từ hàng nghìn năm trước và thịnh vượng nhất ở các đời Đường–Tống–Minh–Thanh. Nổi tiếng nhất là "tứ đại danh tú": Tô tú (Tô Châu), Tương tú (Hồ Nam), Thục tú (Tứ Xuyên) và Việt tú (Quảng Đông).',
    'Chỉ vàng, chỉ bạc được dùng để thêu trên lễ phục và giày của hoàng tộc, quan lại và cô dâu. Hoa văn trên giày thường là hoa sen, uyên ương, mẫu đơn; mỗi hình ảnh đều là một lời chúc cho người mang.'
  ], 'Bước đến đâu, giàu sang đến đó.',
  'Kỹ thuật thêu hai mặt giống hệt nhau của Tô Châu (双面绣) được xem là một tuyệt kỹ.');

  lore('o2', 'Từ thời Hán (206 TCN – 220) trở đi', [
    'Hán phục (汉服, hànfú) là tên chung của y phục truyền thống người Hán qua nhiều triều đại, gọi theo triều Hán, một triều đại hùng mạnh kéo dài hơn bốn thế kỷ. Đặc trưng là cổ áo vắt chéo, vạt phải đè lên vạt trái (交领右衽), tay áo rộng và dải lụa buộc ngang eo.',
    'Mỗi thời lại thêm nét riêng: áo Đường phóng khoáng, áo Tống thanh nhã, áo Minh trang trọng. Từ đầu những năm 2000, phong trào mặc Hán phục hồi sinh mạnh mẽ, và ngày nay giới trẻ Trung Quốc rất thích mặc nó đi chơi, chụp ảnh ở các cổ trấn.'
  ], 'Thanh nhã, lễ nghĩa, tự hào văn hoá.',
  'Vạt phải đè lên vạt trái là quy tắc quan trọng; kiểu vạt trái đè phải (左衽) từng được xem là cách mặc cho người đã khuất.');

  lore('n1', 'Dân gian · phát triển thời Minh–Thanh', [
    'Khoá trường mệnh (长命锁, chángmìngsuǒ) là chiếc khoá bạc hoặc vàng nhỏ đeo ở cổ trẻ em, thường khắc các chữ như "trường mệnh phú quý" (长命富贵) hay "bách tuế" (百岁). Nguồn gốc của nó được cho là từ tục đeo sợi chỉ ngũ sắc "tục mệnh lũ" (续命缕) dịp Đoan Ngọ thời Hán, sau này thành khoá kim loại, xuất hiện từ thời Minh và phổ biến mạnh vào thời Thanh.',
    'Quan niệm xưa nói chiếc "khoá" sẽ giữ chặt sinh mệnh của bé, không để tà ma bắt đi. Khoá thường do ông bà, cha mẹ tặng và đeo cho đến khi bé lớn; ở một số nơi có lễ "mở khoá" (开锁) đánh dấu khi đứa trẻ trưởng thành.'
  ], 'Sống lâu, khoẻ mạnh, được bảo bọc.',
  'Dây chỉ ngũ sắc dịp Đoan Ngọ vẫn được nhiều gia đình buộc cho trẻ nhỏ đến ngày nay.');

  lore('a2', 'Thời Thương–Chu (hơn 3000 năm trước)', [
    'Chuông là một trong những nhạc khí cổ nhất của Trung Hoa. Chuông đồng đã có từ thời Thương–Chu, nổi bật là bộ chuông biên (编钟, biānzhōng) gồm nhiều quả chuông to nhỏ khác nhau để tấu nhạc cung đình. Bộ chuông biên khai quật ở mộ Tằng Hầu Ất (khoảng năm 433 TCN) gồm khoảng 64–65 chiếc tuỳ cách tính (có một chuông bác bổ sung), là một trong những bộ nhạc khí cổ đồ sộ nhất từng tìm thấy.',
    'Chuông nhỏ (铃铛, língdang) thì gắn với đời sống thường ngày: treo ở mái đình, cổ ngựa, cổ thú nuôi hoặc cổ tay trẻ nhỏ. Người xưa tin tiếng chuông trong trẻo xua tà ma và báo bình an; ở cổ mèo thì còn giúp chủ nghe thấy mèo đi đâu.'
  ], 'Tiếng chuông mang may mắn và xua điều xấu.',
  'Chữ 钟 (zhōng) vừa là "chuông" vừa là "đồng hồ"; vì 送钟 (tặng đồng hồ) đọc giống 送终 (đưa tang), người Trung Quốc kiêng tặng đồng hồ.');

  lore('h3', 'Hoàng gia Trung Hoa · Minh–Thanh', [
    'Hoàng đế Trung Hoa đội mũ miện 冕冠 (miǎnguān) với tấm ván phẳng phía trên, trước sau rủ các chuỗi ngọc (旒, liú). Hoàng hậu đội phượng quan (凤冠, fèngguān), kết bằng vàng, ngọc trai và đá quý, trang trí hình phượng hoàng.',
    'Cuộc khai quật Định Lăng của hoàng đế Vạn Lịch nhà Minh (1956–1957) đã tìm được các phượng quan của hoàng hậu, trong đó chiếc "chín rồng chín phượng" đính hơn 3.500 viên ngọc trai (một số tài liệu nói hơn 4.000) cùng hơn 100 viên đá quý. Vương miện vàng của mèo là bản đáng yêu của những báu vật ấy.'
  ], 'Quyền uy, cao quý, thành tựu đỉnh cao.',
  'Theo cách giải thích cổ, các chuỗi ngọc rủ trước mũ miện nhắc vua đừng chăm chăm vào những điều vụn vặt.');

  lore('s3', 'Hoạ tiết từ thời Chiến Quốc–Hán', [
    'Hoa văn "tường vân" (祥云, xiángyún) - những đám mây cuộn hình như ý - xuất hiện trên đồ đồng, sơn mài và lụa từ thời Chiến Quốc, Tần Hán. Người xưa xem mây ngũ sắc là điềm lành báo trời đất hoà hợp, nên mây trở thành hoạ tiết của cung điện, long bào, gạch ngói.',
    'Giày "đầu mây" (云头履, yúntóu lǚ) với mũi giày cong hình mây có từ rất lâu và thịnh hành đến thời Minh–Thanh. Hoa văn tường vân cũng được dùng cho ngọn đuốc Thế vận hội Bắc Kinh 2008, mang tên "Tường Vân".'
  ], 'Bước trên mây lành: thuận lợi, thăng tiến, may mắn.',
  'Mây 云 (yún) đọc gần giống vận 运 (yùn), nên mây cũng gợi ý "vận may".');

  lore('o3', 'Hoàng bào các triều đại · nổi bật Minh–Thanh', [
    'Long bào (龙袍, lóngpáo) là áo thụng thêu rồng của hoàng đế. Từ đời Đường, màu vàng dần trở thành màu dành riêng cho hoàng gia, sang Minh–Thanh thì dân thường không được mặc. Long bào nhà Thanh thường thêu chín con rồng cùng các biểu tượng cát tường như mặt trời, mặt trăng, mây và sóng nước.',
    'Phần gấu áo có dải sóng nước nhiều màu (海水江崖, hǎishuǐ jiāngyá) tượng trưng cho biển cả và núi non, hàm ý "giang sơn vững bền" - áo của mèo cũng được thêu đúng hoạ tiết ấy ở vạt dưới. Chữ 福 ngay ngực là lời chúc dành cho bạn.'
  ], 'Quyền lực, phú quý, thành công rực rỡ.',
  'Người xưa xem 9 là số dương lớn nhất nên gắn với hoàng đế; vì thế mới có "chín rồng" trên long bào.');

  lore('a3', 'Thỏi bạc từ thời Hán · phổ biến Nguyên–Thanh · Thần Tài: dân gian Minh', [
    'Nguyên bảo (元宝, yuánbǎo) là thỏi vàng bạc hình chiếc thuyền. Thỏi vàng làm tiền lớn đã có từ thời Hán, còn thỏi bạc trở thành tiền tệ lớn quen thuộc từ thời nhà Nguyên và dùng đến hết thời Thanh. Ngày nay nó là biểu tượng của tiền tài, xuất hiện khắp nơi dịp Tết, kể cả trong món sủi cảo gói hình nguyên bảo.',
    'Thần Tài (财神, Cáishén) có nhiều vị, trong đó vị được thờ nhiều là Triệu Công Minh (赵公明), nổi tiếng nhờ tiểu thuyết Phong Thần Diễn Nghĩa thời Minh. Dân gian có tục "đón Thần Tài" vào mùng 5 Tết, mong năm mới buôn bán thuận lợi, tiền vào như nước.'
  ], 'Phát tài phát lộc, thành quả xứng đáng với công sức.',
  'Giữ chuỗi 300 ngày là cực hiếm: hào quang này là phần thưởng cho sự kiên trì của bạn!');

  /* --- quà đổi bằng cá --- */
  lore('x01', 'Điển tích Chiến Quốc · truyền thuyết Đông Tấn', [
    'Trang Chu mộng điệp (庄周梦蝶) là điển tích triết học nổi tiếng của Trang Tử (sống khoảng 369–286 TCN theo ước tính): ông mơ mình hoá bướm bay lượn tự do, tỉnh dậy không biết mình là Trang Chu vừa mơ làm bướm hay bướm đang mơ làm Trang Chu. Từ đó bướm trở thành biểu tượng của tự do và những câu hỏi lớn về thực và mộng.',
    'Trong dân gian, bướm còn là hiện thân của tình yêu chung thuỷ qua truyền thuyết Lương Sơn Bá - Chúc Anh Đài (bối cảnh đời Đông Tấn): hai người không đến được với nhau, khi mất hoá thành đôi bướm bay quanh nhau. Chữ 蝶 (dié) đọc gần giống 耋 (dié, người thọ tám mươi), nên bướm cũng là lời chúc trường thọ.'
  ], 'Tự do, tình yêu đẹp và tuổi thọ.',
  'Chuyện Lương - Chúc được ví như "Romeo và Juliet của Trung Hoa"; bản nhạc violin "Lương Chúc" (1959) rất nổi tiếng.');

  lore('x02', 'Cây trồng cổ · Sở Từ (thời Chiến Quốc)', [
    'Cam quýt có nguồn gốc ở vùng phía Nam Trung Hoa và đã được nhắc trong sách cổ như Thượng Thư - Vũ Cống. Trong Sở Từ có bài "Quất tụng" (橘颂), truyền thống gán cho Khuất Nguyên (một số học giả còn ngờ về tác giả), ca ngợi cây quýt: sinh ra ở đâu thì gắn bó với quê hương nơi đó, tượng trưng cho phẩm cách kiên định.',
    'Dịp Tết, người Trung Quốc và người Hoa khắp nơi tặng nhau quýt, cam, đặt lên bàn thờ. Chữ 橘 (jú) đọc gần với 吉 (jí, cát tường), còn 橙 (chéng, cam) đọc giống 成 (chéng, thành công), nên quýt cam là lời chúc may mắn và thành đạt.'
  ], 'Cát tường, may mắn, thành công.',
  'Quất vàng (金桔, jīnjú) thường được trồng trong chậu để bày ngày Tết.');

  lore('x03', 'Thời Thương (khoảng 1250–1046 TCN)', [
    'Rùa là một trong "Tứ linh" (四灵) của Trung Hoa, cùng với rồng, phượng hoàng và kỳ lân. Thời nhà Thương, người ta khắc câu hỏi bói toán lên mai rùa và xương thú rồi hơ lửa xem vết nứt để đoán điềm. Đó chính là giáp cốt văn (甲骨文), dạng chữ Hán cổ nhất được biết đến.',
    'Rùa sống lâu nên là biểu tượng của trường thọ, bền bỉ và vững vàng. Huyền Vũ (玄武), thần thú trấn phương Bắc trong Tứ Tượng, mang hình con rùa quấn rắn. "Chậm mà chắc" rất hợp với việc học chữ Hán mỗi ngày!'
  ], 'Trường thọ, vững vàng, kiên trì.',
  'Giáp cốt văn được tìm thấy ở di chỉ Ân Khư (An Dương, Hà Nam), kinh đô cuối cùng của nhà Thương.');

  lore('x04', 'Thi hoạ đời Tống · "Tuế hàn tam hữu"', [
    'Mai nở giữa mùa đông giá lạnh nên được người Trung Hoa tôn là biểu tượng của nghị lực và khí tiết. Mai cùng tùng, trúc hợp thành "Tuế hàn tam hữu" (岁寒三友, ba người bạn mùa lạnh), và cùng lan, trúc, cúc hợp thành "Tứ quân tử" (四君子) trong hội hoạ.',
    'Thi nhân Lâm Bô (林逋) đời Bắc Tống ẩn cư bên Tây Hồ, không vợ con, chỉ trồng mai và nuôi hạc, nên được gọi là "mai thê hạc tử" (梅妻鹤子, vợ là mai, con là hạc). Dân gian còn nói năm cánh hoa mai tượng trưng cho năm điều phúc.'
  ], 'Kiên cường, thanh cao, vượt khó mà nở hoa.',
  'Mai (梅, méi) đọc giống 眉 (mày), nên có bức tranh "Hỉ thượng mi sao" vẽ chim hỉ thước đậu cành mai.');

  lore('x05', 'Truyền thuyết Ngưu Lang – Chức Nữ', [
    'Hỉ thước (喜鹊, xǐquè) là chim ác là, được người Trung Quốc xem là loài chim báo tin vui: tiếng kêu của nó nghĩa là khách quý hay tin mừng sắp tới. Trong truyền thuyết Ngưu Lang - Chức Nữ, mỗi năm vào ngày 7 tháng 7 âm lịch (lễ Thất Tịch), đàn chim thước bay lên bắc cầu qua sông Ngân Hà để đôi tình nhân gặp nhau.',
    'Truyền thuyết này đã được kể từ hàng nghìn năm nay và Thất Tịch ngày nay thường được xem là "Valentine của Trung Hoa". Trong tranh dân gian, hỉ thước đậu cành mai gọi là "Hỉ thượng mi sao" (喜上眉梢), nghĩa là niềm vui hiện lên đầu mày.'
  ], 'Tin vui, hạnh phúc, duyên lành.',
  'Hỉ thước là hình mẫu quen thuộc trong tranh cắt giấy dán cửa sổ (窗花) ngày Tết.');

  lore('x06', 'Truyền thuyết thời Tây Hán', [
    'Sữa đậu nành (豆浆, dòujiāng) là thức uống người Trung Hoa dùng từ rất lâu đời. Tương truyền Lưu An (刘安), Hoài Nam Vương thời Tây Hán, là người nghĩ ra cách xay đậu nành thành sữa và nấu thành đậu phụ, nhưng chưa có bằng chứng lịch sử trực tiếp (kể cả trong các tác phẩm của chính Lưu An cũng không thấy nhắc đến đậu phụ), nên đây vẫn là truyền thuyết. Một bức phù điêu trong mộ Đông Hán được tìm thấy năm 1960 từng được dẫn làm chứng cho thuyết đậu phụ có từ thời Hán, song nhiều học giả cho rằng khi ấy mới ở dạng sơ khai.',
    'Ngày nay, sáng sớm ở Trung Quốc, một bát sữa đậu nành nóng ăn kèm bánh quẩy (油条, yóutiáo) hoặc bánh bao là bữa sáng quen thuộc. Sữa đậu nành là nguồn đạm thực vật rẻ và ngon, hợp với cả người ăn chay.'
  ], 'Khởi đầu ngày mới ấm bụng, đủ năng lượng học bài.',
  'Bánh quẩy thường được cho là đã xuất hiện từ khoảng thời Tống.');

  lore('x07', 'Ngọc Lương Chử (khoảng 3300–2300 TCN) → Lễ Ký', [
    'Người Trung Hoa chuộng ngọc từ thời đồ đá mới: nền văn hoá Lương Chử (khoảng 3300-2300 TCN) đã chế tác những món ngọc tinh xảo như ngọc bích (璧) và ngọc tông (琮). Ngọc bội (玉佩, yùpèi) là món ngọc đeo bên người của quý tộc, treo ở đai lưng hoặc trước ngực.',
    'Sách Lễ Ký ghi rằng quân tử không rời ngọc trừ khi có biến cố (君子无故，玉不去身). Khổng Tử còn ví đức của người quân tử với ngọc: ấm áp, trong trẻo, kiên định. Tiếng ngọc chạm nhau khi bước đi nhắc người đeo giữ phong thái chậm rãi, điềm đạm.'
  ], 'Bình an, cao quý, đức hạnh.',
  'Thành ngữ 金玉良缘 (jīnyù liángyuán) - "duyên lành vàng ngọc" - dùng để chúc đôi lứa xứng đôi.');

  lore('x08', 'Thi văn Bắc Tống · Chu Đôn Di', [
    'Sen (莲花, liánhuā) mọc từ bùn mà không nhiễm bùn. Học giả Bắc Tống Chu Đôn Di (1017-1073) viết bài "Ái liên thuyết" ca ngợi sen là "quân tử trong các loài hoa" vì thanh sạch, ngay thẳng, giữ phẩm giá giữa nơi bùn lầy.',
    'Sen còn gắn với Phật giáo (toà sen của Phật) và nhiều lời chúc chơi chữ: 莲 (lián) đọc giống 连 (liền, liên tiếp), 荷 (hé) gần với 和 (hoà, hoà thuận). Tranh "Liên sinh quý tử" (连生贵子) vẽ sen cùng hạt sen để chúc con cháu đầy đàn.'
  ], 'Thanh cao, trong sạch, hoà thuận.',
  'Hạt sen và củ sen đều ăn được; chè hạt sen là món bổ dưỡng ở nhiều vùng Trung Quốc.');

  lore('x09', 'Kinh Thi · Đường–Tống', [
    'Dế mèn (蟋蟀, xīshuài) đã xuất hiện trong Kinh Thi, bài "Thất nguyệt" tả dế vào nhà khi trời trở lạnh. Thời Đường, cung nữ nuôi dế trong lồng nhỏ bằng vàng để nghe tiếng dế đêm; tới đời Tống, chọi dế (斗蟋蟀, dòu xīshuài) trở thành thú vui phổ biến.',
    'Cuối đời Nam Tống, tể tướng Giả Tự Đạo (贾似道) mê chọi dế đến mức được cho là tác giả cuốn "Xúc chức kinh" (促织经), thường được xem là sách chuyên về dế sớm nhất. Tới đời Thanh, Bồ Tùng Linh còn viết truyện "Xúc chức" trong Liêu Trai Chí Dị.'
  ], 'Cần cù, nhắc ta học đều đặn khi mùa thu về.',
  'Ở Trung Quốc có cả những chiếc ống nuôi dế bằng gốm và ngà rất tinh xảo, nay thành đồ sưu tầm.');

  lore('x10', 'Thần thoại · Tây Du Ký (đời Minh)', [
    'Đào tiên (蟠桃, pántáo) của Tây Vương Mẫu (西王母) được kể là ba nghìn năm mới chín một lần, ăn vào sẽ trường sinh (trong Tây Du Ký có ba loại, chín sau 3.000, 6.000 và 9.000 năm). Trong tiểu thuyết Tây Du Ký đời Minh, Tôn Ngộ Không được giao coi vườn bàn đào rồi ăn trộm đào tiên cũng chính vì sức hấp dẫn đó.',
    'Vì thế quả đào (寿桃, shòutáo) là biểu tượng trường thọ. Dịp mừng thọ người già, người ta dâng đào thật hoặc bánh bao nhân đậu nặn hình quả đào, điểm chấm hồng ở đầu. Gỗ đào còn được tin là trừ tà, nên có tục treo "đào phù" (桃符) trước cửa ngày Tết.'
  ], 'Trường thọ, khoẻ mạnh, hiếu kính với ông bà.',
  'Truyện Đông Phương Sóc (东方朔) thời Hán Vũ Đế "ăn trộm" đào của Tây Vương Mẫu có trong sách "Hán Vũ cố sự" (khoảng thế kỷ 3), tức là truyền thuyết viết muộn hơn nhân vật thật nhiều thế kỷ.');

  lore('x11', 'Thịnh Đường · Lạc Dương', [
    'Mẫu đơn (牡丹, mǔdān) được tôn là "hoa vương" (花王) và "quốc sắc thiên hương" (国色天香). Thời Đường, Trường An và Lạc Dương nổi cơn say mẫu đơn, dân chúng đổ ra ngắm hoa mỗi độ xuân về; đến đời Tống, Âu Dương Tu viết "Lạc Dương mẫu đơn ký" (khoảng năm 1034, một số tài liệu ghi 1031) ghi chép hàng chục giống hoa.',
    'Dân gian kể rằng Võ Tắc Thiên từng ra lệnh cho trăm hoa nở giữa mùa đông, chỉ mẫu đơn không chịu nở nên bị đày đến Lạc Dương. Đây là giai thoại dân gian, nhưng cho thấy mẫu đơn mang khí chất kiêu hãnh.'
  ], 'Phú quý, thịnh vượng, vẻ đẹp rực rỡ.',
  'Lễ hội Mẫu đơn Lạc Dương vẫn được tổ chức mỗi mùa xuân đến nay.');

  lore('x12', 'Đông Tấn · "Nang huỳnh dạ độc"', [
    'Xưa có chàng Xa Dận (车胤) thời Đông Tấn, nhà nghèo không có dầu thắp đèn nên bắt đom đóm bỏ vào túi lụa mỏng để lấy ánh sáng đọc sách mỗi đêm. Câu chuyện "nang huỳnh dạ độc" (囊萤夜读) trở thành thành ngữ chỉ sự khắc khổ học hành.',
    'Truyện của Xa Dận thường đi liền với Tôn Khang (孙康) học nhờ ánh tuyết (映雪), hợp thành thành ngữ "nang huỳnh ánh tuyết" (囊萤映雪) vốn được nhắc trong sách vỡ lòng Tam Tự Kinh. Còn về đom đóm, người xưa từng tin chúng sinh ra từ cỏ mục (腐草为萤).'
  ], 'Hiếu học, vượt khó, ánh sáng nhỏ soi đường lớn.',
  'Ánh sáng đom đóm là "ánh sáng lạnh": gần như không toả nhiệt.');

  lore('x13', 'Thắt nút cổ xưa · phát triển Đường–Minh–Thanh', [
    'Trước khi có chữ viết, người xưa dùng nút thắt dây để ghi nhớ sự việc (结绳记事), và Kinh Dịch có nhắc đến thời thượng cổ "thắt nút dây mà cai trị". Về sau, nghệ thuật thắt nút trở thành thủ công mỹ nghệ, phát triển ở đời Đường-Tống và thịnh vượng thời Minh-Thanh, dùng trang trí ngọc bội, quạt, rèm, đèn lồng.',
    'Chữ 结 (jié) đọc gần với 吉 (cát) và còn có nghĩa kết nối, đoàn kết. Những kiểu nút nổi tiếng như "bàn trường kết" (盘长结), đường dây liền không đứt, tượng trưng cho gắn bó và bình an vô tận. Tên "Trung Quốc kết" (中国结) được phổ biến từ cuối thập niên 1970–1980, khi phong trào thắt nút hồi sinh ở Đài Loan nhờ bà Lydia Chen.'
  ], 'Gắn kết, đoàn viên, may mắn không dứt.',
  'Nút thắt đỏ thường được treo trước cửa nhà dịp Tết cùng câu đối.');

  lore('x14', 'Truyền thuyết Nam Tống', [
    'Kẹo hồ lô (糖葫芦, tánghúlu) là xiên sơn tra (táo gai) bọc đường giòn tan. Tương truyền thời Nam Tống, một vị phi tần được Tống Quang Tông sủng ái bị bệnh nặng, thầy thuốc dân gian kê toa sơn tra nấu với đường phèn và nàng khỏi bệnh; món ăn từ đó lan ra dân gian.',
    'Ngày nay kẹo hồ lô gắn với mùa đông Bắc Kinh: người bán rong cắm từng xiên đỏ rực trên cọc rơm. Chữ 葫芦 (húlu) đọc gần với 福禄 (fúlù, phúc lộc), nên xiên kẹo cũng là lời chúc "phúc lộc" cho người ăn.'
  ], 'Phúc lộc, ngọt ngào, vui vẻ.',
  'Ngày nay người ta cũng làm kẹo hồ lô bằng dâu tây, nho, quýt, nhưng bản gốc vẫn là sơn tra.');

  lore('x15', 'Điềm lành dân gian Hán–Tấn · tục Thất Tịch', [
    'Nhện được xem là điềm lành vì cách gọi "hỉ tử, hỉ chu" (喜蛛, xǐzhū). Sách "Tây Kinh tạp ký" (chép chuyện Tây Hán nhưng được biên soạn muộn hơn, các học giả cho là không sớm hơn thế kỷ 3, tương truyền gắn với Cát Hồng) có ghi những điềm báo dân gian, trong đó chim thước kêu thì có khách tới, nhện giăng tơ thì sắp có chuyện vui.',
    'Trong lễ Thất Tịch, các cô gái có tục "khất xảo" (乞巧): đặt nhện vào hộp rồi hôm sau xem mạng nhện giăng đẹp hay không để đoán tài khéo tay. Vì vậy nhện còn là biểu tượng của sự khéo léo, cần mẫn.'
  ], 'Niềm vui từ trời xuống, khéo léo, cần mẫn.',
  'Thành ngữ 喜从天降 (xǐ cóng tiān jiàng) - "niềm vui từ trời rơi xuống" - rất hợp với hình ảnh nhện thả mình từ sợi tơ.');

  lore('x16', 'Truyền thuyết Lôi Tổ (khoảng 2700 TCN) · Con đường Tơ lụa', [
    'Trung Hoa là cái nôi của nghề tơ lụa. Truyền thuyết kể rằng Lôi Tổ (嫘祖), vợ Hoàng Đế, thấy một cái kén rơi vào tách trà nóng, kéo ra được sợi tơ dài rồi dạy dân nuôi tằm dệt lụa. Khảo cổ học tìm thấy vải tơ ở di chỉ Tiền Sơn Dương (Chiết Giang) có tuổi khoảng 4.200–4.700 năm tuỳ nguồn; một số mảnh tơ ở Hà Nam còn được cho là cổ hơn nữa (khoảng 5.300 năm).',
    'Lụa Trung Hoa theo Con đường Tơ lụa tới tận châu Âu, còn kỹ thuật nuôi tằm được giữ bí mật hàng thế kỷ. Một con tằm nhả ra sợi tơ liền dài hàng trăm đến cả nghìn mét để làm kén. Người xưa trồng dâu nuôi tằm và có lễ cúng "Tằm thần".'
  ], 'Cần mẫn, tích tiểu thành đại, bền bỉ nhả tơ.',
  'Tằm chỉ ăn lá dâu, nên "dâu" (桑) và "tằm" (蚕) đi liền nhau trong nhiều thành ngữ nhà nông.');

  lore('x17', 'Thời Xuân Thu · Lan Đình (năm 353)', [
    'Lan (兰花, lánhuā) toả hương thanh nhã nơi hang vắng nên là biểu tượng của quân tử và tình bạn. Khổng Tử được cho là từng nói lan mọc trong rừng sâu không vì vắng người ngắm mà thôi toả hương, ý nhắc người quân tử giữ đạo dù không ai biết đến.',
    'Năm 353, danh sĩ Vương Hy Chi cùng hơn 40 bạn hữu họp mặt ở Lan Đình (兰亭) bên Thiệu Hưng, uống rượu làm thơ, và ông viết "Lan Đình tập tự" - được tôn là "thiên hạ đệ nhất hành thư". Vì thế lan gắn liền với thư pháp và đời sống văn nhân.'
  ], 'Thanh nhã, bạn tri kỷ, đức hạnh thầm lặng.',
  'Thành ngữ 金兰之交 (jīnlán zhī jiāo) chỉ tình bạn thân thiết, gắn bó như vàng như lan.');

  lore('x18', 'Thời Hán–Đường', [
    'Bộ dao (步摇, bùyáo) là loại trâm cài tóc có các chuỗi hạt, ngọc rủ xuống, mỗi bước đi lại đung đưa nên mới có tên "bước đi, lay động". Sách "Thích Danh" của Lưu Hy thời Đông Hán đã giải thích tên gọi này.',
    'Bộ dao thịnh hành từ thời Hán đến Nam–Bắc triều và vẫn được dùng ở các đời sau, thường tạo hình chim phượng, hoa, bướm, kèm vàng và ngọc. Quan niệm xưa cho rằng bước chân nhẹ nhàng, trâm lay khẽ là dáng đi thanh tao của người phụ nữ.'
  ], 'Duyên dáng, thanh lịch, nhẹ nhàng mà rực rỡ.',
  'Bộ dao xuất hiện rất nhiều trong phim cổ trang Trung Quốc.');

  lore('x19', 'Truyền thuyết Hán · phong thuỷ dân gian', [
    'Cóc ba chân ngậm đồng tiền (三足金蟾, sānzú jīnchán) là linh vật chiêu tài. Theo một số dị bản truyền thuyết, Hằng Nga uống thuốc trường sinh rồi bay lên cung trăng và hoá thành con cóc (蟾蜍), nên cóc gắn với mặt trăng và cung trăng còn được gọi là "Thiềm cung" (蟾宫).',
    'Thành ngữ "thiềm cung chiết quế" (蟾宫折桂), bẻ cành quế trong cung trăng, là cách nói thi đỗ khoa cử. Về sau, truyền thuyết về Lưu Hải Thiềm (刘海蟾, tên thật Lưu Thao, đạo sĩ thời Ngũ Đại khoảng thế kỷ 10, thường được xếp vào hàng "chuẩn Thần Tài") đi cùng con cóc ba chân, rải tiền giúp dân nghèo khiến cóc vàng trở thành vật tượng trưng cho tài lộc trong dân gian.'
  ], 'Chiêu tài, thi cử đỗ đạt, may mắn.',
  'Theo phong thuỷ dân gian, cóc vàng thường được đặt quay mặt vào trong nhà để "hút tiền vào".');

  lore('x20', 'Ngọc cổ từ thời Thương · phổ biến Minh–Thanh', [
    'Người Trung Hoa chế tác vòng ngọc từ thời đồ đá mới (như văn hoá Hồng Sơn). Thời nhà Thương, ngọc đã rất được trọng: ngôi mộ Phụ Hảo (khoảng 1200 TCN) chứa 755 món ngọc. Nguồn ngọc (có cả ngọc nephrite, nhiều người nhắc tới ngọc Hoà Điền ở Tân Cương) vẫn còn được giới nghiên cứu bàn luận.',
    'Vòng ngọc (玉镯, yùzhuó) trở nên phổ biến ở thời Minh-Thanh. Mẹ chồng thường tặng con dâu một chiếc vòng ngọc gia truyền như lời chào đón; người ta còn nói 金有价，玉无价, "vàng có giá, ngọc vô giá". Dân gian tin vòng ngọc có thể "đỡ tai hoạ" cho chủ nhân.'
  ], 'Bình an, hiền hoà, bền lâu.',
  'Ngọc phỉ thuý (翡翠, fěicuì) màu xanh biếc trở nên được ưa chuộng nhiều từ thời nhà Thanh.');

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

  // view: 'full' | 'mini' | 'thumb' ; eq: {h,s,o,a,j,n,f,m,k,g} ; mood: '' | 'happy' | 'sad' ; vb: tuỳ chọn khung nhìn
  function catSVG(view, eq, mood, vb) {
    eq = eq || {};
    var h = byId(eq.h), sh = byId(eq.s), o = byId(eq.o), a = byId(eq.a), j = byId(eq.j), n = byId(eq.n),
        f = byId(eq.f), m = byId(eq.m), k = byId(eq.k), g = byId(eq.g);
    var box = vb || (view === 'mini' ? '28 0 144 144' : '0 0 200 232');
    var s = '<svg viewBox="' + box + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';
    if (a && a.back) s += a.back;
    s += BASE_BACK;
    if (g) s += g.svg;
    if (k) s += k.svg;
    if (m) s += m.svg;
    if (sh) s += sh.svg;
    if (o) s += o.svg;
    if (a && a.layer === 'pre') s += a.svg;
    if (n) s += n.svg;
    s += headSVG(mood);
    if (a && a.layer === 'post') s += a.svg;
    if (j) s += j.svg;
    if (h) s += h.svg;
    if (f) s += f.svg + GRIP;
    return s + '</svg>';
  }
  function thumbSVG(it) {
    var vb = it.vb || VB[it.slot];
    if (it.solo) return '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + it.svg + '</svg>';
    var eq = {}; eq[it.slot] = it.id;
    return catSVG('thumb', eq, '', vb);
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
  function blankEq() { var o = {}; SLOT_ORDER.forEach(function (k) { o[k] = ''; }); return o; }
  function idList(arr, test) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (id) { var it = typeof id === 'string' ? byId(id) : null; if (it && test(it) && out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  function normP(p) {
    p = p || {};
    var e = p.eq || {}, out = blankEq();
    SLOT_ORDER.forEach(function (k) { var it = typeof e[k] === 'string' ? byId(e[k]) : null; out[k] = it && it.slot === k ? it.id : ''; });
    // own = món đã đổi bằng cá; sv = món quà mốc mới (nw) đã xem
    return { nm: String(p.nm || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, NAME_MAX), eq: out, sn: p.sn | 0, t: p.t | 0,
      own: idList(p.own, function (it) { return !!it.cost; }), sv: idList(p.sv, function (it) { return !!it.nw; }) };
  }
  function normFish(o) {
    o = o || {};
    var d = o.d && o.d.day ? o.d : blankDay();
    return { e: o.e || {}, fd: o.fd || {}, sp: o.sp || {}, ts: o.ts | 0,
      d: { day: d.day, v: d.v | 0, x: d.x | 0, f: d.f | 0, keys: d.keys || {} }, p: normP(o.p) };
  }
  function unionIds(a, b) { var r = a.slice(); b.forEach(function (x) { if (r.indexOf(x) < 0) r.push(x); }); return r; }
  function mergeFish(a, b) {
    if (!a) return b ? normFish(b) : normFish();
    if (!b) return normFish(a);
    var r = normFish(), k;
    ['e', 'fd', 'sp'].forEach(function (f) {
      for (k in a[f]) r[f][k] = Math.max(a[f][k] | 0, (b[f][k] | 0));
      for (k in b[f]) r[f][k] = Math.max(r[f][k] | 0, b[f][k] | 0);
    });
    var pickD = a.d.day > b.d.day ? a : a.d.day < b.d.day ? b : (a.ts >= b.ts ? a : b);
    r.d = pickD.d; r.ts = Math.max(a.ts, b.ts);
    r.p = normP(a.p.t >= b.p.t ? a.p : b.p);
    r.p.sn = Math.max(a.p.sn, b.p.sn);
    r.p.own = unionIds(a.p.own, b.p.own);   // đồ đã đổi: hợp nhất, không bao giờ mất
    r.p.sv = unionIds(a.p.sv, b.p.sv);
    return r;
  }
  function fishKeyOf(uid) { return 'meow_cat_fish_v1_' + (uid || 'guest'); }
  function readFish(uid) {
    try { var o = JSON.parse(localStorage.getItem(fishKeyOf(uid))); if (o && o.e) return normFish(o); } catch (e) {}
    return null;
  }
  function fishBalance() { return fish ? Math.max(0, sum(fish.e) - sum(fish.fd) - sum(fish.sp)) : 0; }
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

  // 5 từ vựng đúng = +1 cá (mỗi từ chỉ được tính 1 lần/ngày). Đếm số từ qua fish.d.keys nên không cần thêm trường dữ liệu mới.
  function correct(key) {
    whenReady(function () {
      rollDay();
      var k = 'v:' + key;
      if (fish.d.keys[k]) return;
      fish.d.keys[k] = 1;
      var n = 0, i;
      for (i in fish.d.keys) if (i.indexOf('v:') === 0) n++;        // số từ đúng hôm nay
      var owed = Math.floor(n / VOCAB_PER_FISH) - fish.d.v;          // cá đáng được nhận - cá đã nhận
      var got = owed > 0 ? addFish(owed, 'v') : 0;
      if (!got) persistFish();                                       // chưa đủ 5 từ vẫn phải lưu để nhớ số từ
    });
  }
  // bài tập: làm đạt (>= PASS_SCORE %) 1 phần bài tập nhỏ của 1 bài => +EX_FISH cá, mỗi phần chỉ nhận 1 lần/ngày
  function reward(key, score) {
    whenReady(function () {
      rollDay();
      var k = 'g:' + key;
      if (fish.d.keys[k]) return;
      if ((Number(score) || 0) < PASS_SCORE) return;
      fish.d.keys[k] = 1;
      if (!addFish(EX_FISH, 'x')) persistFish();
    });
  }
  // game: thắng 1 lượt (đúng >= GAME_WIN_WORDS từ/câu) => +GAME_FISH cá. Chơi lại được tiếp, nhưng tổng cá bài tập + game có trần mỗi ngày (FISH_EX_CAP).
  function gameWin(name, words) {
    if ((Number(words) || 0) < GAME_WIN_WORDS) return;
    whenReady(function () { rollDay(); addFish(GAME_FISH, 'x'); });
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

  function owns(id) { return !!fish && fish.p.own.indexOf(id) >= 0; }
  function isOpen(it) { return it.cost ? owns(it.id) : it.day <= bestDays(); } // quà mốc chuỗi hoặc món đã đổi bằng cá
  function eqSafe() { // chỉ cho mặc những món đã mở
    var out = blankEq();
    if (!fish) return out;
    SLOT_ORDER.forEach(function (k) { var it = byId(fish.p.eq[k]); if (it && it.slot === k && isOpen(it)) out[k] = it.id; });
    return out;
  }
  function unseen() { // quà mốc chuỗi chưa xem (món mới nw của bản này cũng báo cho người chơi cũ)
    if (!fish || !lastView) return [];
    var best = bestDays(), sn = fish.p.sn;
    return ITEMS.filter(function (it) { return it.day <= best && (it.day > sn || (it.nw && fish.p.sv.indexOf(it.id) < 0)); });
  }
  function claimNew() { // mở quà mới: tự mặc món mới của mỗi loại (không đè món mốc cao hơn đang mặc)
    var list = unseen();
    if (!list.length) return [];
    list.forEach(function (it) {
      var cur = byId(fish.p.eq[it.slot]);
      if (!cur || !cur.day || cur.day <= it.day) fish.p.eq[it.slot] = it.id;
      if (it.nw && fish.p.sv.indexOf(it.id) < 0) fish.p.sv.push(it.id);
    });
    fish.p.sn = Math.max(fish.p.sn, list[list.length - 1].day);
    touchP(); persistFish();
    return list;
  }
  function nextItem() {
    var best = bestDays();
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].day > best) return ITEMS[i];
    return null;
  }
  // đổi cá lấy món: không giới hạn số lần/ngày, mỗi món đổi 1 lần. Mỗi máy ghi bộ đếm "đã tiêu" riêng (fish.sp) nên đồng bộ không mất cá.
  function buy(id) {
    var it = byId(id);
    if (!fishReady || !it || !it.cost || owns(id) || fishBalance() < it.cost) return false;
    fish.sp[DEV] = (fish.sp[DEV] | 0) + it.cost;
    fish.p.own.push(id);
    fish.p.eq[it.slot] = id;
    touchP(); persistFish(); updateMini();
    return true;
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

    /* v3: tab 3 mục, bộ lọc, cửa hàng */
    '.tab{padding:10px 4px;white-space:nowrap;font-size:12.5px}@media(max-width:380px){.tab em{display:none}}',
    '.fl{display:flex;gap:6px;overflow-x:auto;margin:0 -16px 12px;padding:2px 16px 4px;scrollbar-width:none}.fl::-webkit-scrollbar{display:none}',
    '.fc{flex:none;padding:7px 12px;border:1.5px solid var(--line);border-radius:99px;background:#fff;color:#7A4A00;font:800 12px/1 var(--f);cursor:pointer}',
    '.fc[aria-pressed=true]{background:var(--gold);border-color:#D9A21E;color:#4A2A00}.fc:focus-visible{outline:3px solid var(--gold);outline-offset:2px}',
    '.note.tl{margin:0 0 10px;text-align:left}.empty{padding:22px 10px;text-align:center;color:var(--mut);font-size:13px}',
    '.shophd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;padding:10px 12px;border-radius:16px;background:#EEF8F3;border:1.5px solid #CFE8DA}',
    '.shophd .sb{font-size:13px;color:#2F6C58;white-space:nowrap}.shophd .sb b{font-size:20px;color:#1F5F4A}.shophd .ss{font-size:11px;color:#5B8A76;text-align:right}',
    '.it .pr{display:inline-block;margin-top:1px;padding:2px 9px;border-radius:99px;background:#E7F5EE;color:#1F7A55;font-weight:800}',
    '.it.short .pr{background:#F6EEDF;color:#A8957F}.it.short .th svg{opacity:.7}',
    '.next.shopb{border-color:#CFE8DA;background:linear-gradient(135deg,#EEF8F3,#DDF1E7)}.next.shopb .gt svg{filter:none;opacity:1}',
    '.next.shopb b{color:#1F5F4A}.next.shopb small,.next.shopb .go2{color:#2F6C58}',
    '.th .hov,.th .dng,.th .gl{animation:none}',
    /* khung lịch sử */
    '.shw{position:absolute;inset:0;z-index:5}.scrim{position:absolute;inset:0;background:rgba(42,20,16,.3);animation:fade .2s ease}',
    '.sheet{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;max-height:64%;border-radius:24px 24px 0 0;background:#fff;box-shadow:0 -12px 32px rgba(42,20,16,.3);animation:sheetup .28s cubic-bezier(.2,.9,.3,1)}',
    '.sheet:focus{outline:none}.sheet .x{background:#F4E9D7}',
    '.sh-hd{flex:none;display:flex;gap:12px;align-items:center;padding:14px 52px 8px 16px}',
    '.sh-th{flex:none;width:84px;height:84px;overflow:hidden;border-radius:18px;background:#FFF3E0;border:1.5px solid var(--line)}.sh-th svg{display:block;width:100%;height:100%}',
    '.sh-tt{min-width:0}.sh-tt b{display:block;font:800 17px/1.25 var(--f);color:#7A1020}.sh-tt em{font:700 13px var(--fz);font-style:normal;color:#A07A3A}.sh-tt .py{display:block;font-size:12px;color:#A07A3A}',
    '.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.tg{padding:2px 9px;border-radius:99px;background:#F4E9D7;color:#8A5A00;font:800 10.5px/1.6 var(--f)}.tg.gold{background:#FFE9B8}',
    '.sh-bd{flex:1;min-height:0;overflow:auto;padding:4px 16px 12px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
    '.era{display:inline-block;margin:2px 0 6px;padding:4px 10px;border-radius:99px;background:#EAF5FC;color:#2F6C8C;font:800 11.5px/1.4 var(--f)}',
    '.lore h4{margin-top:8px;font:800 13.5px/1.3 var(--f);color:#7A1020}.lore p{margin:4px 0 8px;font-size:13px;line-height:1.6;color:#4A3A32}',
    '.fact{margin-top:6px;padding:10px 12px;border-radius:14px;background:#FFF6DF;border:1.5px dashed #F0CE7A;font-size:12.5px;line-height:1.5;color:#6A4A00}',
    '.sh-ft{flex:none;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));border-top:1.5px solid var(--line);background:#fff}',
    '.go.sm{padding:13px 16px;font-size:14.5px}.go.mint{background:var(--mint);box-shadow:0 4px 0 #146048}.go.mint:active{box-shadow:0 1px 0 #146048}',
    '.go:disabled{background:#CDBFB0;box-shadow:0 4px 0 #B3A596;cursor:default;transform:none}',
    '.shint{margin-top:8px;text-align:center;font-size:12px;color:var(--mut)}',
    '.okmsg{margin-bottom:8px;padding:8px 10px;border-radius:12px;background:#EEF8F3;color:#1F5F4A;font-weight:700;font-size:12.5px;text-align:center}',

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
    '@keyframes sheetup{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes hov{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-5px)}}',
    '@keyframes dng{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}',
    '@keyframes glw{0%,100%{opacity:.2}50%{opacity:.6}}',
    '.hov{animation:hov 2.4s ease-in-out infinite}.dng{animation:dng 2.8s ease-in-out infinite}.gl{animation:glw 2s ease-in-out infinite}',
    '@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.cf{display:none}}'
  ].join('');

  var host, root, ov, badge, mini, lastView = null, lastFocus = null;
  var ctx = { client: null, uid: null, canSync: false }, prefs = null;
  var ui = { mode: 'main', tab: 'today', editing: false, sel: null, newIds: [], cat: 'all', msg: '' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function copyFor(view) {
    var n = view.state.count, kind = view.kind, name = esc(catName()), fz = view.state.freezes;
    var ms = MILESTONES.indexOf(n) >= 0 && (kind === 'extended' || kind === 'saved');
    var h, p;
    if (kind === 'first') {
      h = '你好! Chúng mình bắt đầu chuỗi nhaaa';
      p = 'Hôm nay là ngày đầu tiên. Mai quay lại để chuỗi lên nào!!! ' + (n + 1) + ' ngày nha!';
    } else if (kind === 'extended') {
      h = ms ? 'Mốc ' + n + ' ngày liên tiếp!' : 'Đã giữ chuỗi hôm nay! Bạn giỏi quá iii';
      p = ms ? name + ' tự hào về bạn lắm. 太棒了!' : name + ' đã giữ chuỗi giúp bạn rồi. Mai nhớ quay lại nha!';
    } else if (kind === 'saved') {
      h = 'Thẻ đóng băng đã cứu chuỗi! ❄';
      p = 'Bạn vắng ' + view.missed + ' ngày, ' + name + ' đã dùng ' + view.used + ' thẻ để giữ chuỗi ' + n + ' ngày cho bạn.';
    } else if (kind === 'reset') {
      h = 'Chuỗi cũ đã đứt, mình làm lại nhé, huhu';
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
    if (ui.mode === 'adopt') return 'Meow~ bạn đặt tên cho tui điiii';
    if (ui.mode === 'reward') return 'Oa! Mình có đồ mới rồi nè!';
    if (o && o.named) return 'Meo~ Mình thích cái tên "' + catName() + '" lắm! ♥';
    if (o && o.fed) return f >= FEED_CAP ? 'Ực… no căng rồi! Cảm ơn bạn nhiều ♥' : ['好吃! Ngon quá xá lun, cảm ơn bảo bối nha', 'Nhồm nhoàm… ngon ghê á!', 'Meo meo~ thêm miếng nữa nha!'][f % 3];
    if (f >= FEED_CAP) return 'Mèo no rồi, mai mèo ăn tiếp hen!';
    if (f >= 3) return 'Mèo no căng rồi ♥';
    if (f >= 1) return 'Mèo ăn ngon quá xá lun, 谢谢你!';
    return bal > 0 ? 'Meow~ tui đói bụng rồi, có ai cho tui ăn cá hong z' : 'Meo~ mình đói… làm bài đúng để kiếm cá cho mình được hong';
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
      '<div class="phint">Đúng 5 từ vựng +1 🐟 · Làm đạt mỗi phần bài tập +1 🐟 · Thắng game (đúng 10 từ) +1 🐟 · Cá dùng để cho mèo ăn hoặc đổi quà ở tab "Đổi quà" · đã cho ăn tổng ' + fishFedTotal() + ' 🐟</div></div>';
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
    if ((o && (o.fed || o.named || o.bought)) || ui.mode !== 'main') return 'happy';
    if (fish) rollDay();
    var f = fish ? fish.d.f : 0;
    var lost = !!(lastView && lastView.kind === 'reset');
    var hungry = fishReady && f < 1;
    if ((hungry || lost) && f < 1) return 'sad';
    return '';
  }
  function catBoxHTML(o) {
    return catSVG('full', eqSafe(), moodNow(o)) +
      (o && o.fed ? '<span class="fly">🐟</span>' : '') +
      (o && (o.fed || o.bought) ? '<span class="hr h1">♥</span><span class="hr h2">♥</span><span class="hr h3">♥</span>' : '');
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
      nextHTML() + shopTeaserHTML() + pantryHTML() + mailHTML();
  }

  /* --- thẻ: tủ đồ + cửa hàng đổi cá --- */
  function ownedShopCount() { return SHOP.filter(function (i) { return owns(i.id); }).length; }
  function countUnlocked() { return ITEMS.filter(isOpen).length + ownedShopCount(); }
  function inCat(it) { return ui.cat === 'all' || SLOT_CAT[it.slot] === ui.cat; }
  function filtersHTML() {
    return '<div class="fl" role="group" aria-label="Lọc theo loại">' + CATS.map(function (c) {
      return '<button type="button" class="fc" data-act="cat" data-c="' + c[0] + '" aria-pressed="' + (ui.cat === c[0]) + '">' + c[1] + '</button>';
    }).join('') + '</div>';
  }
  function itemBtn(it, shop) {
    var got = isOpen(it), on = got && fish.p.eq[it.slot] === it.id, bal = fishBalance(), sub;
    var cls = 'it' + (!got && !shop ? ' lock' : '') + (shop && !got && bal < it.cost ? ' short' : '') + (on ? ' on' : '') + (ui.sel === it.id ? ' sel' : '');
    if (shop && !got) sub = '<span class="pr">🐟 ' + it.cost + '</span>';
    else if (!got) sub = 'Mốc ' + it.day + ' ngày';
    else sub = on ? 'Đang mặc' : (it.cost ? 'Đã đổi' : 'Đã mở');
    return '<button type="button" class="' + cls + '" data-act="sel" data-id="' + it.id + '" aria-pressed="' + on + '">' +
      '<div class="th"><span class="slot">' + SLOTS[it.slot] + '</span>' + thumbSVG(it) + (!got && !shop ? '<span class="lk">🔒</span>' : '') + (on ? '<span class="tick">✓</span>' : '') + '</div>' +
      '<b>' + esc(it.name) + '</b><small>' + sub + '</small></button>';
  }
  function closetHTML() {
    var list = ITEMS.concat(SHOP.filter(function (i) { return owns(i.id); })).filter(inCat);
    var h = '<div class="note tl">Tủ đồ của ' + esc(catName()) + ' · ' + countUnlocked() + '/' + ALL.length + ' món. Bấm vào món đồ để xem lịch sử và mặc cho mèo.</div>' + filtersHTML();
    if (list.length) { h += '<div class="cl">'; list.forEach(function (it) { h += itemBtn(it, false); }); h += '</div>'; }
    else h += '<div class="empty">Mục này chưa có món nào. Ghé tab "Đổi quà" để đổi bằng cá nhé!</div>';
    return h + '<button class="lnk center" type="button" data-act="tab-shop">🛍 Đổi thêm quà bằng cá</button><button class="lnk center" type="button" data-act="strip">Cởi hết đồ</button>';
  }
  function shopHTML() {
    var list = SHOP.filter(inCat), h;
    h = '<div class="shophd"><div class="sb">🐟 <b>' + fishBalance() + '</b> cá trong túi</div><div class="ss">Đổi không giới hạn số lần · mỗi món đổi 1 lần · đã có ' + ownedShopCount() + '/' + SHOP.length + ' món</div></div>' +
      filtersHTML() + '<div class="cl">';
    list.forEach(function (it) { h += itemBtn(it, true); });
    return h + '</div><div class="note">Kiếm cá: đúng 5 từ vựng, làm đạt bài tập hoặc thắng game. Món đã đổi sẽ nằm trong Tủ đồ.</div>';
  }
  function shopTeaserHTML() {
    if (!fishReady) return '';
    var left = SHOP.filter(function (i) { return !owns(i.id); }), bal = fishBalance();
    if (!left.length) return '<div class="next done">🛍 Bạn đã đổi hết quà trong cửa hàng, quá đỉnh!</div>';
    var cheap = left[0], can = left.filter(function (i) { return i.cost <= bal; }).length;
    return '<button type="button" class="next shopb" data-act="tab-shop"><div class="gt">' + thumbSVG(cheap) + '</div><div class="tx">' +
      '<b>' + (can ? 'Có ' + can + ' món đổi được ngay!' : 'Đổi cá lấy quà cho mèo') + '</b>' +
      '<small>' + (can ? 'Bạn đang có ' + bal + ' 🐟' : 'Món rẻ nhất: ' + esc(cheap.name) + ' · cần ' + cheap.cost + ' 🐟, còn thiếu ' + (cheap.cost - bal)) + '</small></div><span class="go2">›</span></button>';
  }
  // khung lịch sử ra đời của món đồ (hiện khi bấm vào 1 món)
  function sheetHTML() {
    var it = ui.sel ? byId(ui.sel) : null;
    if (!it || !fish) return '';
    var got = isOpen(it), worn = got && fish.p.eq[it.slot] === it.id, bal = fishBalance(), lo = LORE[it.id] || { era: '', ps: [], mean: '', fact: '' }, act;
    if (it.cost && !got) {
      act = bal >= it.cost
        ? '<button type="button" class="go sm" data-act="buy" data-id="' + it.id + '">Đổi món này · 🐟 ' + it.cost + '</button>'
        : '<button type="button" class="go sm" disabled>Cần thêm ' + (it.cost - bal) + ' 🐟 để đổi</button><div class="shint">Bạn đang có ' + bal + ' 🐟. Làm bài đúng để kiếm thêm cá nhé!</div>';
    } else if (!got) {
      act = '<button type="button" class="go sm" disabled>🔒 Giữ chuỗi ' + it.day + ' ngày để mở (còn ' + Math.max(1, it.day - countDays()) + ' ngày)</button>';
    } else {
      act = '<button type="button" class="go sm mint" data-act="wear" data-id="' + it.id + '">' + (worn ? 'Cởi ra' : 'Mặc cho mèo') + '</button>';
    }
    return '<div class="shw"><div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-label="Lịch sử: ' + esc(it.name) + '" tabindex="-1">' +
      '<button class="x" type="button" data-act="sheet-close" aria-label="Đóng">×</button>' +
      '<div class="sh-hd"><div class="sh-th">' + thumbSVG(it) + '</div><div class="sh-tt"><b>' + esc(it.name) + '</b><em>' + it.zh + '</em><span class="py">' + it.py + '</span>' +
      '<div class="tags"><span class="tg">' + SLOTS[it.slot] + '</span>' + (it.cost ? '<span class="tg gold">🐟 ' + it.cost + '</span>' : '<span class="tg gold">Mốc ' + it.day + ' ngày</span>') + '</div></div></div>' +
      '<div class="sh-bd">' + (lo.era ? '<div class="era">🕰 ' + esc(lo.era) + '</div>' : '') +
      '<div class="lore"><h4>📜 Lịch sử ra đời</h4>' + lo.ps.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (lo.mean ? '<h4>🧧 Ý nghĩa</h4><p>' + esc(lo.mean) + '</p>' : '') + '</div>' +
      (lo.fact ? '<div class="fact">💡 <b>Bạn có biết?</b> ' + esc(lo.fact) + '</div>' : '') + '</div>' +
      '<div class="sh-ft">' + (ui.msg ? '<div class="okmsg" role="status">' + esc(ui.msg) + '</div>' : '') + act + '</div></div></div>';
  }

  /* --- thẻ: đặt tên + nhận quà --- */
  function adoptHTML() {
    var chips = NAME_IDEAS.map(function (n) { return '<button type="button" class="chip" data-act="chip" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('');
    return '<h2 class="ttl">Đặt tên cho chú mèo của bạn</h2>' +
      '<p class="sub">Meow sẽ ở bên bạn mỗi ngày học, cùng bạn giữ chuỗi và nhận quà. Hong thích tên cũ thì đổi tên mới nhen </p>' +
      '<form class="nmf big" data-form="adopt" autocomplete="off"><input maxlength="' + NAME_MAX + '" placeholder="Nhập tên mèo iu nào …" aria-label="Tên mèo"></form>' +
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
      '<button class="tab" type="button" role="tab" data-act="tab-closet" aria-selected="' + (ui.tab === 'closet') + '">🎀 Tủ đồ<em>' + countUnlocked() + '/' + ALL.length + '</em></button>' +
      '<button class="tab" type="button" role="tab" data-act="tab-shop" aria-selected="' + (ui.tab === 'shop') + '">🛍 Đổi quà<em>' + ownedShopCount() + '/' + SHOP.length + '</em></button></div>';
  }
  function bodyHTML() {
    if (ui.mode === 'adopt') return adoptHTML();
    if (ui.mode === 'reward') return rewardHTML();
    return ui.tab === 'closet' ? closetHTML() : ui.tab === 'shop' ? shopHTML() : todayHTML();
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
      '<div class="body">' + bodyHTML() + '</div><div class="foot">' + footHTML() + '</div>' + (ui.mode === 'main' && ui.sel ? sheetHTML() : '') + '</div>';
    var nb = ov.querySelector('.body'); if (nb) nb.scrollTop = st;
  }
  function refreshSheet(keep) { // vẽ lại riêng khung lịch sử
    var card = ov.querySelector('.card'); if (!card) return;
    var old = card.querySelector('.shw'), st = 0;
    if (old) { var bd = old.querySelector('.sh-bd'); if (keep && bd) st = bd.scrollTop; card.removeChild(old); }
    if (ui.mode === 'main' && ui.sel) {
      var t = document.createElement('div'); t.innerHTML = sheetHTML();
      var el = t.firstChild;
      if (el) { card.appendChild(el); var nb = el.querySelector('.sh-bd'); if (nb) nb.scrollTop = st; }
    }
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
  function open(auto, tab) {
    if (!lastView || !ov || !fishReady) return;
    lastFocus = document.activeElement;
    ui.tab = tab === 'shop' || tab === 'closet' ? tab : 'today'; ui.editing = false; ui.sel = null; ui.msg = '';
    ui.mode = pickMode(!!auto);
    renderCard();
    ov.classList.add('on');
    focusInitial();
  }
  function close() {
    ov.classList.remove('on');
    ui.editing = false; ui.sel = null; ui.msg = '';
    updateDot();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* --- xử lý thao tác --- */
  function handle(act, t) {
    var el, box;
    switch (act) {
      case 'close': close(); break;
      case 'tab-today': case 'tab-closet': case 'tab-shop':
        ui.tab = act.slice(4); ui.sel = null; ui.msg = ''; refreshBody(false); refreshSheet();
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
      case 'sel': selTap(t.getAttribute('data-id')); break;
      case 'sheet-close': closeSheet(); break;
      case 'wear': wearTap(t.getAttribute('data-id')); break;
      case 'buy': buyTap(t.getAttribute('data-id')); break;
      case 'cat':
        ui.cat = t.getAttribute('data-c') || 'all'; refreshBody(false);
        el = ov.querySelector('.fc[aria-pressed=true]'); if (el) el.focus();
        break;
      case 'strip':
        fish.p.eq = blankEq(); touchP(); persistFish(); updateMini(); refreshCat(); refreshBody(true);
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

  function selTap(id) { ui.sel = id; ui.msg = ''; refreshBody(true); refreshSheet(false); focusSheet(); }
  function closeSheet() {
    var id = ui.sel; ui.sel = null; ui.msg = '';
    refreshSheet(); refreshBody(true);
    var b = id && ov.querySelector('.it[data-id="' + id + '"]'); if (b) b.focus();
  }
  function focusSheet() { var el = ov.querySelector('.sheet .go:not(:disabled)') || ov.querySelector('.sheet .x'); if (el) el.focus(); }
  function wearTap(id) {
    var it = byId(id); if (!it || !isOpen(it)) return;
    fish.p.eq[it.slot] = fish.p.eq[it.slot] === id ? '' : id; ui.msg = '';
    touchP(); persistFish(); updateMini(); refreshCat(); refreshBody(true); refreshSheet(true); focusSheet();
  }
  function buyTap(id) {
    var it = byId(id); if (!it || !buy(id)) return;
    ui.msg = '🎉 Đã đổi! Mèo mặc luôn rồi (−' + it.cost + ' 🐟)';
    refreshCat({ bought: true });
    var m = ov.querySelector('.mood'); if (m) m.textContent = 'Oa! Mình có ' + it.name + ' rồi, cảm ơn bạn nhiều ♥';
    refreshBody(true); refreshSheet(true); focusSheet();
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
      if (ui.sel) { closeSheet(); return; }
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
    show: function (tab) { open(false, tab); }, // MeowCat.show('shop') mở thẳng tab Đổi quà
    correct: correct,
    reward: reward,
    gameWin: gameWin,
    name: function () { return catName(); },
    setName: function (n) { return fishReady ? commitName(n) : false; },
    fish: function () { return fishReady ? { balance: fishBalance(), fed: fishFedTotal(), level: levelName() } : null; },
    state: function () { return lastView ? { count: lastView.state.count, best: lastView.state.best, last: lastView.state.last } : null; }
  };

  hookTracking(0);
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
})();
