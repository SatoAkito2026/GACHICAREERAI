// ポスポスのページへ行くリンクを押したら、ブラウザの読み上げで「ポスポス」と言ってから移動する。
// 読み上げが使えない端末や、新しいタブで開くとき（Ctrl/⌘押し・中クリック・target=_blank）はそのまま移動する。
(function () {
  var synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  var TARGET = /^\/posupos(-day|-night)?(\.html)?$/;
  var MAX_WAIT = 1200; // 読み上げが終わらなくても、この時間で移動する

  var jaVoice = null;
  var pickVoice = function () {
    var vs = synth.getVoices() || [];
    jaVoice = vs.filter(function (v) { return /^ja/i.test(v.lang); })[0] || null;
  };
  pickVoice();
  if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', pickVoice);

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
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance('ポスポス');
      u.lang = 'ja-JP';
      if (jaVoice) u.voice = jaVoice;
      u.rate = 1.15;
      u.pitch = 1.4;
      u.onend = function () { setTimeout(go, 60); };
      u.onerror = go;
      synth.speak(u);
      setTimeout(go, MAX_WAIT);
    } catch (err) {
      go();
    }
  });
})();
