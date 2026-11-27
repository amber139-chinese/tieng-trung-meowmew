/*
 * Meow Meow Dictionary - nạp dữ liệu.
 * - Shard dữ liệu được lưu vào IndexedDB theo phiên bản dữ liệu: lần sau mở nhanh hơn và vẫn tra được những từ
 *   đã xem khi mất mạng.
 * - index.json luôn ưu tiên mạng (có timeout), lỗi mạng thì dùng bản đã lưu.
 * - Không có IndexedDB (chế độ riêng tư...) thì vẫn chạy bình thường, chỉ không có cache bền.
 */
(function (root) {
  'use strict';
  var DB_NAME = 'meowdict', STORE = 'files', TIMEOUT = 12000;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('no-idb'));
      var req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  var dbp = null;
  function db() { if (!dbp) dbp = openDB().catch(function () { return null; }); return dbp; }
  function idbGet(key) {
    return db().then(function (d) {
      if (!d) return undefined;
      return new Promise(function (resolve) {
        try {
          var r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          r.onsuccess = function () { resolve(r.result); };
          r.onerror = function () { resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    });
  }
  function idbPut(key, val) {
    return db().then(function (d) {
      if (!d) return;
      try { d.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key); } catch (e) { /* bỏ qua */ }
    });
  }
  function fetchJSON(url) {
    var ctrl = root.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function createLoader() {
    var version = null;
    return function load(path) {
      var isManifest = /index\.json$/.test(path);
      if (isManifest) {                                     // manifest: mạng trước, lỗi thì dùng bản lưu
        return fetchJSON(path).then(function (m) {
          version = m.version; idbPut('manifest', m); return m;
        }, function (err) {
          return idbGet('manifest').then(function (m) { if (m) { version = m.version; return m; } throw err; });
        });
      }
      var key = (version || '0') + ':' + path;              // shard gắn với phiên bản: cache-first an toàn
      return idbGet(key).then(function (hit) {
        if (hit !== undefined) return hit;
        return fetchJSON(path).then(function (json) { idbPut(key, json); return json; });
      });
    };
  }

  root.MeowDictLoader = { createLoader: createLoader };
})(typeof window !== 'undefined' ? window : globalThis);
