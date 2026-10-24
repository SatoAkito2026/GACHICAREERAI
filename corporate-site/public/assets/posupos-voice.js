// ポスポスのページ（入口・昼・夜）を開いた瞬間に「ポスポス♪」（assets/posupos.mp3）を1回鳴らす。
// 同じタブでは1回だけ（昼↔夜を行き来しても鳴らし直さない）。
// ブラウザが音の自動再生を止めたとき（iPhone・はじめて来た人など）は、そのページで最初に画面を押したときに鳴らす。
(function () {
  var KEY = 'posupos-jingle-played';
  try { if (sessionStorage.getItem(KEY)) return; } catch (err) { /* 保存できない端末は毎回鳴らす */ }
  var sound;
  try {
    sound = new Audio(new URL('assets/posupos.mp3', document.baseURI).href);
    sound.preload = 'auto';
  } catch (err) { return; }

  var done = false;
  var events = ['pointerdown', 'keydown', 'touchstart'];
  var finish = function () {
    done = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (err) { /* 何もしない */ }
    events.forEach(function (ev) { window.removeEventListener(ev, tryPlay, true); });
  };
  var tryPlay = function () {
    if (done) return;
    try {
      var p = sound.play();
      if (p && p.then) p.then(finish, function () { /* 自動再生が止められた。次の操作で鳴らす */ });
      else finish();
    } catch (err) { finish(); }
  };
  events.forEach(function (ev) { window.addEventListener(ev, tryPlay, { capture: true, passive: true }); });
  tryPlay();
})();
