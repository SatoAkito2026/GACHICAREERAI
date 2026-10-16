// AKITOグループ 共通スクリプト（ヘッダー・メニュー・スクロールで出てくる動き）
(function () {
  var head = document.querySelector('.site-head');
  var btn = document.getElementById('menu-btn');

  if (head) {
    var onScroll = function () { head.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (head && btn) {
    var setOpen = function (open) {
      head.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? '閉じる' : 'メニュー';
    };
    btn.addEventListener('click', function () { setOpen(!head.classList.contains('open')); });
    head.querySelectorAll('.nav a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
  }

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // スクロールで出てくる動き。最初の画面に見えているものは隠さない
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var t = e.target;
      t.classList.remove('pending');
      setTimeout(function () { t.style.transitionDelay = ''; }, 1200);
      io.unobserve(t);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  var vh = window.innerHeight;
  document.querySelectorAll('.rv').forEach(function (el) {
    if (el.getBoundingClientRect().top > vh) {
      el.classList.add('pending');
      var i = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.transitionDelay = (Math.max(i, 0) % 4) * 0.08 + 's';
      io.observe(el);
    }
  });
})();
