/*
 * Meow Meow Dictionary - phát âm.
 * Dùng đúng cách chọn giọng của các bài học HSK (ví dụ hsk2_bai1.html): giọng Mandarin có sẵn của trình duyệt,
 * ưu tiên giọng nữ tự nhiên (Xiaoxiao, Google, Siri, Tingting...), tốc độ 0,88.
 * Giọng thực tế phụ thuộc thiết bị và trình duyệt của người học (Edge/Chrome thường cho giọng tốt nhất).
 */
(function (root) {
  'use strict';
  var RATE = 0.88, voices = [], femaleList = [], currentVoice = null;
  var supported = !!(root.speechSynthesis && root.SpeechSynthesisUtterance);

  function voiceGender(n) {
    if (/Yunxi|Yunjian|Yunyang|Yunxia|Yunhao|Kangkang|Li-?mu/i.test(n)) return 'M';
    if (/Xiaoxiao|Xiaoyi|Xiaobei|Xiaoni|Xiaohan|Xiaomeng|Xiaomo|Xiaoxuan|Xiaorui|Xiaoshuang|Huihui|Yaoyao|Ting-?ting|Mei-?jia|Yu-?shu|Lili|Google|普通话/i.test(n)) return 'F';
    return '';
  }
  function rank(v) {
    var n = v.name, s = 0;
    if (/Xiaoxiao/i.test(n)) s += 100; else if (/Yunxi/i.test(n)) s += 100;
    else if (/Xiaoyi|Yunjian|Yunyang|Yunxia/i.test(n)) s += 90;
    if (/Natural|Online/i.test(n)) s += 60;
    if (/Google/i.test(n)) s += 50;
    if (/Premium|Enhanced|Siri/i.test(n)) s += 40;
    if (/Tingting|Ting-Ting|Meijia/i.test(n)) s += 20;
    if (!v.localService) s += 5;
    if (/Kangkang|Yaoyao|Huihui|Lili/i.test(n)) s -= 30;
    return s;
  }
  function loadVoices() {
    try {
      voices = root.speechSynthesis.getVoices().filter(function (v) { return /^zh[-_]CN/i.test(v.lang) || /Mandarin|普通话|Putonghua/i.test(v.name); });
      voices.sort(function (a, b) { return rank(b) - rank(a); });
      femaleList = voices.filter(function (v) { return voiceGender(v.name) === 'F'; });
      if (!femaleList.length) femaleList = voices.filter(function (v) { return voiceGender(v.name) === ''; });
      currentVoice = femaleList[0] || voices[0] || null;
    } catch (e) { /* giữ giọng mặc định của trình duyệt */ }
  }
  if (supported) { root.speechSynthesis.onvoiceschanged = loadVoices; setTimeout(loadVoices, 150); loadVoices(); }

  function speak(text) {
    if (!supported) return false;
    try {
      root.speechSynthesis.cancel();
      var u = new root.SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = RATE; u.pitch = 1;
      if (currentVoice) u.voice = currentVoice;
      root.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  root.MeowDictSpeech = { speak: speak, supported: function () { return supported; }, voiceName: function () { return currentVoice ? currentVoice.name : ''; } };
})(typeof window !== 'undefined' ? window : globalThis);
