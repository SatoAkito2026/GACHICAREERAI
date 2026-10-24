// ポスポスのページへ行くリンクを押したら、「ポスポス♪」の効果音（assets/posupos.mp3）を鳴らしてから移動する。
// 音が鳴らせないときはブラウザの読み上げで代わりに言う。どちらも使えない端末や、
// 新しいタブで開くとき（Ctrl/⌘押し・中クリック・target=_blank）はそのまま移動する。
(function () {
  var TARGET = /^\/posupos(-day|-night)?(\.html)?$/;
  var MAX_WAIT = 1400; // 鳴り終わらなくても、この時間で移動する
  var sound = null;
  try {
    sound = new Audio(new URL('assets/posupos.mp3', document.baseURI).href);
    sound.preload = 'auto';
  } catch (err) { sound = null; }

  var speak = function (done) {
    var synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return done();
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance('ポスポス');
      u.lang = 'ja-JP';
      u.rate = 1.15;
      u.pitch = 1.4;
      u.onend = function () { setTimeout(done, 60); };
      u.onerror = done;
      synth.speak(u);
    } catch (err) { done(); }
  };

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || !TARGET.test(url.pathname)) return;
    // 同じページの中の移動（#だけ違う）はそのまま
    if (url.pathname === location.pathname && url.search === location.search) return;

    e.preventDefault();
    var gone = false;
    var go = function () { if (gone) return; gone = true; location.href = url.href; };
    setTimeout(go, MAX_WAIT);
    if (!sound) return speak(go);
    try {
      sound.currentTime = 0;
      sound.onended = function () { setTimeout(go, 40); };
      var p = sound.play();
      if (p && p.catch) p.catch(function () { speak(go); });
    } catch (err) {
      speak(go);
    }
  });
})();
