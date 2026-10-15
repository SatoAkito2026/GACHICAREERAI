// AKITOグループ 共通スクリプト（ヘッダー・メニュー・スクロールで出てくる動き・相談会の日付）
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

  // 無料相談会（毎月第2・第4火曜日）の次の開催日。日本時間で数える
  var slots = document.querySelectorAll('[data-next-consult]');
  if (slots.length) {
    var jst = new Date(Date.now() + 9 * 3600 * 1000);
    var y = jst.getUTCFullYear(), m = jst.getUTCMonth(), today = Date.UTC(y, m, jst.getUTCDate());
    var found = [];
    for (var k = 0; k < 3 && found.length < 3; k++) {
      var yy = y + Math.floor((m + k) / 12), mm = (m + k) % 12;
      var first = new Date(Date.UTC(yy, mm, 1)).getUTCDay();
      var firstTue = 1 + ((2 - first + 7) % 7);
      [firstTue + 7, firstTue + 21].forEach(function (d) {
        var t = Date.UTC(yy, mm, d);
        if (t >= today && found.length < 3) found.push(new Date(t));
      });
    }
    var fmt = function (d) { return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日（火）'; };
    slots.forEach(function (el) {
      var n = parseInt(el.getAttribute('data-next-consult'), 10) || 1;
      el.innerHTML = found.slice(0, n).map(function (d, i) {
        return '<li><span class="nc-label">' + (i === 0 ? '次回' : 'その次') + '</span><b>' + fmt(d) + '</b></li>';
      }).join('');
    });
  }

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
