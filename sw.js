/* ============================================================
   Service Worker —— 首屏外壳离线缓存
   策略：导航请求 network-first（保证更新），静态资源 cache-first
   ============================================================ */
var CACHE = 'lxy-site-v8';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  /* 本地化的字体与背景图：不走外网，首屏不再等任何外部资源 */
  './assets/fonts/fonts-local.css',
  './assets/fonts/fa-local.css',
  './assets/bg/forest_bg.jpg',
  './assets/bg/forest_bg_sm.jpg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll 全量失败会整体 reject，逐个放兜底 */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* 音频不进 Cache Storage：几 MB 的 mp3 缓存起来太占空间，
     而且没必要拦 —— 不接管 Range 请求，拖动进度条才顺畅 */
  if (/\.(mp3|m4a|ogg|wav|flac)$/i.test(url.pathname)) return;


  /* 导航请求：网络优先，离线回退缓存首页 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  /* 同源静态资源：缓存优先 + 后台更新 */
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});
