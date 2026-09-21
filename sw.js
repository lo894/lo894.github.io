/* ============================================================
   Service Worker —— 首屏外壳离线缓存
   策略：导航请求 network-first（保证更新），静态资源 cache-first
   ============================================================ */
/* v9：6.6MB 的 base64 内联图已抽成 assets/in/*.jpg 外部文件（HTML 7.19MB -> 0.28MB）。
   旧缓存里存的是 7MB 的胖版本，升版本号会在 activate 时整包删掉，强制拉轻量新版。
   v11：留言板接入 Supabase 云端同步（index.html 里的 SUPA_URL / SUPA_KEY 已填），
        升版本号是为了防止访客拿到 CDN / SW 缓存里的旧 HTML（那时留言还只存本地）。
   v12：加载策略优化（图片懒加载全覆盖 / 水波纹延迟初始化 / 加载页 1.5s 兜底 /
        关键图 preload + 字体 CSS 非阻塞 / giscus+不蒜子延迟注入 /
        板块横幅 data-lazybg 懒加载）。index.html 结构变了，
        必须升版本号把访客浏览器与 CDN 里的旧 HTML 挤掉。
   v13：水互动扩展（8 个新触发点复用同一层 WebGL 水面）。
        其中触发点 5「导航/Tab 水波」原有实现依赖元素 ::after，
        而 .nav-links a::after 与 .m-tab.on::after 已被占用 → 改为
        #aqLayer 上的独立节点。HTML/CSS/JS 都变了，升版本号。
   v14：新增「全屏飘花背景」（#aqPetalLayer，PC 24 瓣 / 手机 12 瓣，
        开场铺一次后纯 CSS 无限循环）。HTML 多了一个节点、CSS/JS 都变了。
        同时修掉留言板「云端已删、本机缓存仍显示幽灵留言」的 bug：
        pull 成功后改为以云端为准重建列表（reconcile），并兜底清理测试残留。 */
var CACHE = 'lxy-site-v14';
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
  './assets/fonts/fa-solid-900.woff2',
  './assets/bg/forest_bg.jpg',
  './assets/bg/forest_bg_sm.jpg'
  /* assets/in/*.jpg 不预缓存：22 张共 1.66MB，按需缓存即可，
     首页只下载 HTML(0.28MB) + 首屏几张图，图片自己带 loading="lazy" */
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
