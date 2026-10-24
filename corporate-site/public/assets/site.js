// AKITOグループ 共通スクリプト
// ・ページを移ったら先頭から表示　・ヘッダーと全画面メニュー　・読み進めた量のバーと「先頭へ戻る」
// ・スクロールで出てくる動き　・PCのマウス操作のときだけ、カードを少し傾ける
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 別のページに移ったら、必ず一番上から見せる（#付きのリンクで来たときだけ、その場所へ）
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  var goToStart = function () {
    var id = decodeURIComponent((location.hash || '').slice(1));
    var target = id && document.getElementById(id);
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  };
  goToStart();
  window.addEventListener('load', function () { setTimeout(goToStart, 0); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) goToStart(); });

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // ヘッダーの影・読み進めた量・先頭へ戻るボタン
  var head = document.querySelector('.site-head');
  var bar = document.getElementById('progress');
  var toTop = document.getElementById('to-top');
  var ticking = false;
  var onScroll = function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      var max = Math.max(1, root.scrollHeight - window.innerHeight);
      var p = Math.min(1, y / max).toFixed(4);
      if (head) head.classList.toggle('scrolled', y > 8);
      if (bar) bar.style.setProperty('--p', p);
      if (toTop) { toTop.style.setProperty('--p', p); toTop.classList.toggle('show', y > window.innerHeight * 0.9); }
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  // 全画面メニュー（スマホ・タブレット）
  var btn = document.getElementById('menu-btn');
  var drawer = document.getElementById('drawer');
  if (btn && drawer) {
    var setOpen = function (open) {
      root.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    };
    btn.addEventListener('click', function () { setOpen(!root.classList.contains('menu-open')); });
    drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () { if (window.innerWidth >= 1024) setOpen(false); });
  }

  if (reduce) return;

  // PCのマウス操作のときだけ、.tilt の付いたカードを指の向きに少し傾ける
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.tilt').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        el.classList.add('tilting');
        el.style.transform = 'perspective(900px) rotateX(' + (-y * 6).toFixed(2) + 'deg) rotateY(' + (x * 8).toFixed(2) + 'deg) translateY(-4px)';
        el.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
        el.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () { el.classList.remove('tilting'); el.style.transform = ''; });
    });
  }

  // スクロールで出てくる動き。最初の画面に見えているものは隠さない。
  // 同じ親の中に並んだものは、少しずつずらして出す
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var t = e.target;
      t.classList.remove('pending');
      setTimeout(function () { t.style.transitionDelay = ''; }, 1400);
      io.unobserve(t);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  var vh = window.innerHeight;
  document.querySelectorAll('.rv').forEach(function (el) {
    if (el.getBoundingClientRect().top > vh) {
      el.classList.add('pending');
      var sib = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.classList.contains('rv'); });
      var i = sib.indexOf(el);
      el.style.transitionDelay = (Math.max(i, 0) % 4) * 0.09 + 's';
      io.observe(el);
    }
  });
})();
