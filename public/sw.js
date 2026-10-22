// ガチキャリAI のサービスワーカー（アプリとしてインストールできるようにするためのもの）
// 画面やデータは常にネットから取る（古い画面が残らないように、キャッシュはしない）。
// 電波がないときだけ、「オフラインです」の画面を出す。
const OFFLINE_CACHE = "gachicareer-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
  );
});

// ---- プッシュ通知 ----
// サーバーは中身なしの合図だけを送るので、ここで最新のお知らせを取りに行って表示する
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let n = { title: "ガチキャリAI", body: "新しいお知らせがあります", link: "/" };
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          const res = await fetch(
            `/api/notifications/peek?endpoint=${encodeURIComponent(sub.endpoint)}`,
            { cache: "no-store" },
          );
          if (res.ok) n = await res.json();
        }
      } catch {
        // 取れなくても、通知は出す（iPhone は通知を出さないと受け取りが止まるため）
      }
      await self.registration.showNotification(n.title, {
        body: n.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { link: n.link || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(link);
          return;
        }
      }
      await self.clients.openWindow(link);
    })(),
  );
});
