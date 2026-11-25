/*!
 * meow-cat.js — Mèo giữ chuỗi của Tiếng Trung Meow Meow
 *
 * - Hiện popup khi học viên mở web (1 lần / phiên / ngày) cho biết đã giữ chuỗi chưa.
 * - Luôn có một chú mèo nhỏ ở góc trái dưới của MỌI trang; bấm vào để xem lại chuỗi.
 * - Chuỗi tính theo ngày (giờ máy học viên): mở web mỗi ngày = giữ chuỗi.
 * - Thẻ đóng băng ❄: học đủ 7 ngày liên tiếp nhận 1 thẻ (tối đa 2). Vắng ngày nào thì tự dùng thẻ để cứu chuỗi.
 * - Cá 🐟: làm đúng từ vựng (+1/câu) hoặc làm bài tập (tối đa +5/phần) để kiếm cá, rồi cho mèo ăn trong popup.
 *   Trang khác muốn tặng cá thì gọi:  MeowCat.correct('khoa-duy-nhat')  hoặc  MeowCat.reward('ten-bai', diemPhanTram)
 * - Nhắc qua email: học viên tự nhập email thật trong popup (cần chạy tao-bang-streak.sql + deploy
 *   supabase/functions/streak-reminder).
 * - Lưu localStorage theo tài khoản; nếu đã chạy tao-bang-streak.sql thì đồng bộ lên Supabase
 *   để học viên đổi máy / đổi trình duyệt vẫn giữ chuỗi.
 *
 * Gắn vào trang:  <script defer src="meow-cat.js"></script>
 * Trang không đăng nhập (vd index.html):  <script defer src="meow-cat.js" data-standalone></script>
 */
(function () {
  'use strict';

  if (window.__meowCatLoaded) return;
  window.__meowCatLoaded = true;
  if (window.top !== window) return; // không hiện trong iframe

  /* ====== CẤU HÌNH: đổi tên mèo ở đây ====== */
  var CAT = {
    name: 'Meow Meow Streak', // tên hiển thị
    zh: '福喵',           // tên chữ Hán
    py: 'Fú Māo'         // phiên âm
  };
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
  /* ========================================= */

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

  /* ---------- cá 🐟 ---------- */
  // fish = { e:{máy:số cá kiếm}, fd:{máy:số cá đã cho ăn}, ts, d:{day,v,x,f,keys} }
  // Mỗi máy ghi bộ đếm riêng rồi cộng lại => đồng bộ nhiều thiết bị không mất cá.
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
  function normFish(o) {
    o = o || {};
    var d = o.d && o.d.day ? o.d : blankDay();
    return { e: o.e || {}, fd: o.fd || {}, ts: o.ts | 0,
      d: { day: d.day, v: d.v | 0, x: d.x | 0, f: d.f | 0, keys: d.keys || {} } };
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

  /* ---------- hình mèo (SVG) ---------- */
  function catSVG(view) {
    var vb = view === 'mini' ? '24 8 112 112' : '0 0 160 190';
    return '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g class="tail"><path d="M116 150 C152 150 158 112 138 100" fill="none" stroke="#5B3A29" stroke-width="15" stroke-linecap="round"/>' +
      '<path d="M116 150 C152 150 158 112 138 100" fill="none" stroke="#FFF1DA" stroke-width="10.5" stroke-linecap="round"/></g>' +
      '<ellipse cx="62" cy="181" rx="12" ry="6" fill="#FFF1DA" stroke="#5B3A29" stroke-width="2.5"/>' +
      '<ellipse cx="98" cy="181" rx="12" ry="6" fill="#FFF1DA" stroke="#5B3A29" stroke-width="2.5"/>' +
      /* tai */
      '<path d="M40 48 L36 16 L68 32Z" fill="#FFF1DA" stroke="#5B3A29" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M44 42 L42 24 L58 33Z" fill="#F7A8B8"/>' +
      '<path d="M120 48 L124 16 L92 32Z" fill="#FFF1DA" stroke="#5B3A29" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M116 42 L118 24 L102 33Z" fill="#F7A8B8"/>' +
      /* áo Đường trang */
      '<path d="M42 112 Q38 166 50 178 L110 178 Q122 166 118 112 Q80 100 42 112Z" fill="#C8102E" stroke="#5B3A29" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M48.5 169 L111.5 169 L110 178 L50 178Z" fill="#F2B632"/>' +
      '<path d="M60 106 L80 136 L100 106" fill="none" stroke="#F2B632" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="80" cy="164" r="3.5" fill="#F2B632" stroke="#8A5A00" stroke-width="1.2"/>' +
      /* tay áo + chắp tay */
      '<ellipse cx="56" cy="146" rx="21" ry="12" transform="rotate(-18 56 146)" fill="#C8102E" stroke="#5B3A29" stroke-width="3"/>' +
      '<ellipse cx="104" cy="146" rx="21" ry="12" transform="rotate(18 104 146)" fill="#C8102E" stroke="#5B3A29" stroke-width="3"/>' +
      '<path d="M71 139 Q67 148 71 158" fill="none" stroke="#F2B632" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M89 139 Q93 148 89 158" fill="none" stroke="#F2B632" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="75" cy="150" r="8" fill="#FFF1DA" stroke="#5B3A29" stroke-width="2.5"/>' +
      '<circle cx="85" cy="150" r="8" fill="#FFF1DA" stroke="#5B3A29" stroke-width="2.5"/>' +
      /* đầu */
      '<ellipse cx="80" cy="68" rx="47" ry="40" fill="#FFF1DA" stroke="#5B3A29" stroke-width="3"/>' +
      '<g class="eyes"><path d="M56 78 Q63 69 70 78" fill="none" stroke="#3B2A24" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M90 78 Q97 69 104 78" fill="none" stroke="#3B2A24" stroke-width="3.2" stroke-linecap="round"/></g>' +
      '<circle cx="52" cy="88" r="6.5" fill="#FF9FB0" opacity=".65"/><circle cx="108" cy="88" r="6.5" fill="#FF9FB0" opacity=".65"/>' +
      '<path d="M76 85 L84 85 L80 90Z" fill="#E5758B" stroke="#5B3A29" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M80 90 Q75 97 69 93 M80 90 Q85 97 91 93" fill="none" stroke="#3B2A24" stroke-width="2.4" stroke-linecap="round"/>' +
      '<g stroke="#5B3A29" stroke-width="2" stroke-linecap="round"><path d="M40 84 L22 80 M40 90 L22 92 M120 84 L138 80 M120 90 L138 92"/></g>' +
      /* mũ quả dưa */
      '<path d="M47 54 Q48 24 80 22 Q112 24 113 54 Q80 61 47 54Z" fill="#2B2B3A" stroke="#5B3A29" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M48.5 49 Q80 56 111.5 49 L112.4 54 Q80 61 47.6 54Z" fill="#F2B632"/>' +
      '<circle cx="80" cy="18" r="5" fill="#C8102E" stroke="#5B3A29" stroke-width="2"/>' +
      '<circle cx="80" cy="38" r="9.5" fill="#F2B632" stroke="#8A5A00" stroke-width="1.8"/>' +
      '<text x="80" y="42.2" text-anchor="middle" font-size="11.5" font-weight="700" fill="#C8102E" ' +
      'font-family="\'Noto Sans SC\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif">福</text>' +
      '</svg>';
  }

  /* ---------- giao diện ---------- */
  var CSS = '' +
    ':host{all:initial}' +
    '*{box-sizing:border-box}' +
    '.mini{position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:99998;width:62px;height:62px;' +
    'border:2px solid #F2B632;border-radius:50%;background:#FFF7E6;box-shadow:0 8px 22px rgba(120,20,30,.28);cursor:pointer;padding:3px;' +
    'transition:transform .15s}' +
    '.mini:hover{transform:scale(1.07)}.mini:focus-visible{outline:3px solid #C8102E;outline-offset:2px}' +
    '.mini svg{width:100%;height:100%;display:block}' +
    '.badge{position:absolute;right:-8px;top:-6px;min-width:28px;height:24px;padding:0 6px;border-radius:99px;background:#C8102E;color:#fff;' +
    'font:800 12px/24px system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}' +
    '.badge.off{background:#8A8F98}' +
    '.mini.wiggle{animation:wig 1.2s ease 2}' +
    '.ov{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:18px;' +
    'background:rgba(60,10,16,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}' +
    '.ov.on{display:flex;animation:fade .2s ease}' +
    '.card{position:relative;width:100%;max-width:380px;max-height:calc(100vh - 36px);overflow:auto;border-radius:24px;text-align:center;' +
    'background:radial-gradient(circle at 50% -10%,#FFE9B8 0,#FFF7E6 55%);border:3px solid #F2B632;' +
    'box-shadow:0 0 0 5px #C8102E,0 24px 60px rgba(0,0,0,.4);padding:0 22px 22px;' +
    'font:500 14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#4A2A22;animation:pop .35s cubic-bezier(.2,1.3,.4,1)}' +
    '.top{margin:0 -22px;padding:12px 16px 8px;background:#C8102E;color:#FFE9B8;border-radius:20px 20px 0 0;' +
    'font-weight:800;letter-spacing:.04em;font-size:12px;text-transform:uppercase}' +
    '.top b{font-weight:800;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;margin-right:6px;letter-spacing:0}' +
    '.cat{width:150px;height:176px;margin:8px auto 0;animation:bob 2.2s ease-in-out infinite}.cat svg{width:100%;height:100%;display:block}' +
    '.num{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:2px}' +
    '.flame{font-size:34px;animation:fl 1.1s ease-in-out infinite;transform-origin:50% 90%}' +
    '.n{font:900 52px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#C8102E}' +
    '.n small{font-size:16px;font-weight:800;margin-left:4px;color:#8A3A30}' +
    '.zh{font:700 13px/1.4 "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;color:#9A6A2A;margin-top:2px}' +
    'h2{margin:10px 0 4px;font:800 19px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif;color:#7A1020}' +
    'p{margin:0 0 4px;color:#6A463C}' +
    '.week{display:flex;justify-content:center;gap:7px;margin:14px 0 4px}' +
    '.d{width:36px}.d i{display:flex;width:34px;height:34px;margin:0 auto 3px;border-radius:50%;align-items:center;justify-content:center;' +
    'background:#F3E6CC;border:2px solid #E6D3AE;font-style:normal;font-size:15px;color:#fff}' +
    '.d.k i{background:#C8102E;border-color:#F2B632}' +
    '.d.t i{box-shadow:0 0 0 3px rgba(242,182,50,.55)}' +
    '.d span{font-size:11px;font-weight:700;color:#9A7A5A}.d.t span{color:#C8102E}' +
    '.best{margin-top:10px;font-size:12.5px;color:#8A6A4A}.best b{color:#C8102E}' +
    '.go{margin-top:16px;width:100%;border:0;border-radius:99px;padding:13px 18px;cursor:pointer;background:#C8102E;color:#FFE9B8;' +
    'font:800 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 5px 0 #8E0A20;transition:transform .08s,box-shadow .08s}' +
    '.go:active{transform:translateY(4px);box-shadow:0 1px 0 #8E0A20}.go:focus-visible{outline:3px solid #F2B632;outline-offset:3px}' +
    '.x{position:absolute;right:10px;top:8px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#FFE9B8;' +
    'font:700 18px/30px system-ui;cursor:pointer;padding:0}.x:hover{background:rgba(255,255,255,.3)}' +
    '.d.f i{background:#7FC4E8;border-color:#CDEBFA}' +
    '.fz{margin-top:12px;padding:9px 12px;border-radius:14px;background:#EAF6FC;border:1.5px solid #CDEBFA;color:#2F6C8C;font-size:12.5px;text-align:left}' +
    '.fz b{color:#1F5F85}.fz span{display:block;margin-top:2px;font-size:11.5px;color:#5B8CA6}' +
    '.mail{margin-top:10px;font-size:12.5px;color:#6A463C;text-align:left}' +
    '.lnk{border:0;background:none;padding:4px 0;color:#C8102E;font:700 12.5px/1.3 system-ui,sans-serif;cursor:pointer;text-decoration:underline;text-align:left}' +
    '.mform{display:flex;gap:6px;margin-top:6px}.mform[hidden]{display:none}' +
    '.mform input{flex:1;min-width:0;border:1.5px solid #E6D3AE;border-radius:10px;padding:9px 10px;font:500 13px system-ui,sans-serif;background:#fff;color:#4A2A22}' +
    '.mform input:focus{outline:2px solid #F2B632}' +
    '.sv{border:0;border-radius:10px;padding:0 12px;background:#F2B632;color:#5A3300;font:800 12.5px system-ui,sans-serif;cursor:pointer}' +
    '.mmsg{min-height:0;margin-top:4px;font-size:12px;color:#B3261E}' +
    '.fishpill{position:absolute;right:-12px;bottom:-6px;height:21px;padding:0 7px;border-radius:99px;background:#fff;border:2px solid #7FC4E8;' +
    'color:#1F5F85;font:800 11px/17px system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap}' +
    '.gain{position:fixed;left:88px;bottom:calc(40px + env(safe-area-inset-bottom,0px));z-index:99998;padding:5px 11px;border-radius:99px;background:#1F5F85;' +
    'color:#fff;font:800 14px/1 system-ui,sans-serif;opacity:0;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.25)}' +
    '.gain.on{animation:gainup 1.6s ease forwards}' +
    '.cat{position:relative}' +
    '.mood{margin:4px auto 0;max-width:290px;font-weight:700;color:#7A1020;font-size:13.5px}' +
    '.lvl{display:inline-block;margin-top:5px;padding:2px 10px;border-radius:99px;background:#FFE9B8;border:1px solid #F2B632;color:#8A5A00;font-size:11.5px;font-weight:800}' +
    '.pantry{margin-top:10px;padding:10px 12px;border-radius:14px;background:#EEF8F3;border:1.5px solid #CFE8DA;text-align:left}' +
    '.prow{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
    '.fn{font-size:13px;color:#2F6C58}.fn b{font-size:18px;color:#1F5F4A}' +
    '.pips{display:flex;align-items:center;gap:4px;margin-top:4px}.pips i{width:11px;height:11px;border-radius:50%;background:#D5E8DE;border:1.5px solid #B7D6C5}' +
    '.pips i.on{background:#F2B632;border-color:#C48A00}.pips em{font-style:normal;font-size:11px;color:#5B8A76;margin-left:4px}' +
    '.feed{border:0;border-radius:99px;padding:10px 16px;background:#1F8A6B;color:#fff;font:800 13.5px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 0 #146048;white-space:nowrap}' +
    '.feed:active:not(:disabled){transform:translateY(3px);box-shadow:none}.feed:disabled{background:#B9C9C2;box-shadow:none;color:#fff;cursor:default}' +
    '.feed:focus-visible{outline:3px solid #F2B632;outline-offset:2px}' +
    '.phint{margin-top:6px;font-size:11.5px;color:#5B8A76}' +
    '.cat.eat svg{animation:chomp .55s ease}' +
    '.fly{position:absolute;left:50%;top:38%;font-size:28px;margin:-14px 0 0 -14px;animation:fly .9s ease-in forwards;pointer-events:none}' +
    '.hr{position:absolute;top:30%;font-size:20px;color:#E5486A;opacity:0;pointer-events:none;animation:hrt 1.4s ease-out .5s forwards}' +
    '.hr.h1{left:30%}.hr.h2{left:50%;animation-delay:.65s}.hr.h3{left:68%;animation-delay:.8s}' +
    '@keyframes fly{0%{transform:translate(-110px,70px) rotate(-30deg) scale(1.3);opacity:1}80%{opacity:1}100%{transform:translate(0,0) rotate(0) scale(.3);opacity:0}}' +
    '@keyframes chomp{0%,100%{transform:scale(1)}30%{transform:scale(1.06,.94)}60%{transform:scale(.97,1.04)}}' +
    '@keyframes hrt{0%{transform:translateY(0) scale(.6);opacity:0}20%{opacity:1}100%{transform:translateY(-46px) scale(1.2);opacity:0}}' +
    '@keyframes gainup{0%{transform:translateY(8px);opacity:0}15%{opacity:1}70%{opacity:1}100%{transform:translateY(-28px);opacity:0}}' +
    '@keyframes pop{from{transform:scale(.8) translateY(16px);opacity:0}to{transform:none;opacity:1}}' +
    '@keyframes fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
    '@keyframes fl{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.15) rotate(3deg)}}' +
    '@keyframes wig{0%,100%{transform:rotate(0)}25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}' +
    '@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';

  var host, root, ov, badge, mini, lastView = null, lastFocus = null;
  var ctx = { client: null, uid: null, canSync: false }, prefs = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function copyFor(view) {
    var n = view.state.count, kind = view.kind, name = esc(CAT.name), fz = view.state.freezes;
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
        'Từ hôm nay ' + name + ' cùng bạn đếm lại từ 1.';
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
      return '<div class="mail"><div>📧 Đang nhắc tới <b>' + esc(maskEmail(prefs.email)) + '</b></div>' +
        '<button class="lnk" type="button" data-act="mail-off">Tắt nhắc</button></div>';
    }
    return '<div class="mail"><button class="lnk" type="button" data-act="mail-open">📧 Nhắn nhẹ cho mình qua email khi sắp đứt chuỗi</button>' +
      '<div class="mform" hidden><input type="email" inputmode="email" autocomplete="email" placeholder="email thật của bạn, vd: ban@gmail.com" aria-label="Email nhận nhắc nhở">' +
      '<button type="button" class="sv" data-act="mail-save">Bật nhắc</button></div><div class="mmsg" role="status"></div></div>';
  }

  function wireMail() {
    var box = ov.querySelector('.mail'); if (!box) return;
    var msg = function () { return box.querySelector('.mmsg'); };
    box.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'mail-open') {
        box.querySelector('.mform').hidden = false; e.target.hidden = true; box.querySelector('input').focus();
      } else if (act === 'mail-save') {
        var em = box.querySelector('input').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) || /@meowmeow\.example\.com$/i.test(em)) { msg().textContent = 'Email chưa đúng, bạn kiểm tra lại nhé.'; return; }
        msg().textContent = 'Đang lưu…';
        saveEmailPrefs(em, true).then(function (ok) {
          if (!ok) { msg().textContent = 'Chưa lưu được, bạn thử lại sau nhé.'; return; }
          prefs = { email: em, on: true }; refreshMail();
        });
      } else if (act === 'mail-off') {
        saveEmailPrefs(prefs ? prefs.email : '', false).then(function (ok) {
          if (ok) { prefs = { email: prefs ? prefs.email : '', on: false }; refreshMail(); }
        });
      }
    });
  }
  function refreshMail() {
    var box = ov.querySelector('.mail'); if (!box) return;
    var tmp = document.createElement('div'); tmp.innerHTML = mailHTML();
    box.parentNode.replaceChild(tmp.firstChild, box); wireMail();
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
  function updateFishUI() {
    if (!root) return;
    var pill = root.querySelector('.fishpill');
    if (pill) pill.textContent = '🐟 ' + fishBalance();
  }

  function moodText(opts) {
    var f = fish ? fish.d.f : 0, bal = fishBalance();
    if (opts && opts.fed) return f >= FEED_CAP ? 'Ực… no căng rồi! Cảm ơn bạn nhiều ♥' : ['好吃! Ngon quá, cảm ơn bạn!', 'Nhồm nhoàm… ngon ghê á!', 'Meo meo~ thêm miếng nữa nha!'][f % 3];
    if (f >= FEED_CAP) return 'Mèo no rồi, mai ăn tiếp nhé!';
    if (f >= 3) return 'Mèo no căng rồi ♥';
    if (f >= 1) return 'Mèo ăn ngon lắm, cảm ơn bạn!';
    return bal > 0 ? 'Meo~ mèo đói bụng, bạn cho mèo ăn cá nhé!' : 'Meo~ mèo đói… làm bài đúng để kiếm cá cho mèo nhé!';
  }

  function pantryHTML() {
    if (!fishReady) return '';
    rollDay();
    var bal = fishBalance(), f = fish.d.f, pips = '';
    for (var i = 0; i < FEED_CAP; i++) pips += '<i class="' + (i < f ? 'on' : '') + '"></i>';
    var full = f >= FEED_CAP, can = bal > 0 && !full;
    return '<div class="pantry"><div class="prow"><div><div class="fn">🐟 <b>' + bal + '</b> cá trong túi</div>' +
      '<div class="pips">' + pips + '<em>hôm nay đã ăn ' + f + '/' + FEED_CAP + '</em></div></div>' +
      '<button type="button" class="feed"' + (can ? '' : ' disabled') + '>' + (full ? 'Mèo no rồi' : bal < 1 ? 'Hết cá' : 'Cho ăn 🐟') + '</button></div>' +
      '<div class="phint">Đúng 1 câu từ vựng +1 🐟 · Làm bài tập tới +5 🐟 mỗi phần</div></div>';
  }

  function renderCard(view, opts) {
    var c = copyFor(view), s = view.state;
    ov.innerHTML =
      '<div class="card" role="dialog" aria-modal="true" aria-label="Chuỗi học của bạn">' +
      '<div class="top"><b>' + esc(CAT.zh) + '</b>' + esc(CAT.name) + ' · ' + esc(CAT.py) + '</div>' +
      '<button class="x" type="button" aria-label="Đóng">×</button>' +
      '<div class="cat' + (opts && opts.fed ? ' eat' : '') + '">' + catSVG('full') +
      (opts && opts.fed ? '<span class="fly">🐟</span><span class="hr h1">♥</span><span class="hr h2">♥</span><span class="hr h3">♥</span>' : '') + '</div>' +
      '<div class="mood">' + esc(moodText(opts)) + '</div>' +
      (fishReady ? '<div class="lvl">' + esc(levelName()) + ' · đã ăn ' + fishFedTotal() + ' cá</div>' : '') +
      '<div class="num"><span class="flame">🔥</span><span class="n">' + s.count + '<small>ngày</small></span></div>' +
      '<div class="zh">连续 ' + s.count + ' 天 · liên tiếp ' + s.count + ' ngày</div>' +
      '<h2>' + c.h + '</h2><p>' + c.p + '</p>' +
      '<div class="week">' + weekHTML(s) + '</div>' +
      '<div class="best">Kỷ lục của bạn: <b>' + s.best + ' ngày</b></div>' +
      '<div class="fz">❄ Thẻ đóng băng: <b>' + s.freezes + '/' + MAX_FREEZES + '</b><span>Vắng 1 hôm, mèo tự dùng thẻ để giữ chuỗi. Học đủ ' +
      FREEZE_EVERY + ' ngày liên tiếp nhận thêm 1 thẻ.</span></div>' +
      pantryHTML() +
      mailHTML() +
      '<button class="go" type="button">Học tiếp thôi! 加油</button>' +
      '</div>';
    ov.querySelector('.x').onclick = close;
    ov.querySelector('.go').onclick = close;
    var fb = ov.querySelector('.feed');
    if (fb) fb.onclick = function () {
      if (!feed()) return;
      renderCard(lastView, { fed: true });
      var again = ov.querySelector('.feed');
      (again && !again.disabled ? again : ov.querySelector('.go')).focus();
    };
    wireMail();
  }

  function open() {
    if (!lastView) return;
    renderCard(lastView);
    lastFocus = document.activeElement;
    ov.classList.add('on');
    var g = ov.querySelector('.go'); if (g) g.focus();
  }
  function close() {
    ov.classList.remove('on');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function build() {
    host = document.createElement('div');
    host.id = 'meow-cat-root';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<button class="mini" type="button" aria-label="Xem chuỗi học của ' + esc(CAT.name) + '">' + catSVG('mini') + '<span class="badge">…</span><span class="fishpill">🐟 0</span></button>' +
      '<div class="gain" aria-live="polite"></div><div class="ov"></div>';
    document.body.appendChild(host);
    mini = root.querySelector('.mini');
    badge = root.querySelector('.badge');
    ov = root.querySelector('.ov');
    mini.onclick = open;
    mini.addEventListener('animationend', function () { mini.classList.remove('wiggle'); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('on')) close(); });
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
      badge.textContent = o.res.state.count;
      var flag = 'meow_cat_popup_' + (o.uid || 'guest') + '_' + t, shown = false;
      try { shown = !!sessionStorage.getItem(flag); } catch (e) {}
      if (!shown) {
        try { sessionStorage.setItem(flag, '1'); } catch (e) {}
        open();
      } else {
        mini.classList.add('wiggle');
      }
    }).catch(function () {
      if (badge) badge.textContent = '🔥';
      if (!fishReady) initFish(null, null);
    });
  }

  window.MeowCat = {
    show: open,
    correct: correct,
    reward: reward,
    fish: function () { return fishReady ? { balance: fishBalance(), fed: fishFedTotal(), level: levelName() } : null; },
    state: function () { return lastView ? { count: lastView.state.count, best: lastView.state.best, last: lastView.state.last } : null; }
  };

  hookTracking(0);
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
})();
