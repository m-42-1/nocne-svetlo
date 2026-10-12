/* Nočné svetlo – offline kópia stránky a zvuku digestora.
   Stránka: najprv sieť (nová verzia sa načíta hneď); ak sieť do 3 s neodpovie, použije sa uložená kópia.
   Zvuk digestora: z uloženej kópie (nemení sa), inak zo siete.
   Vďaka tomu sa appka otvorí, aj keď ju iOS znova načíta v čase výpadku Wi-Fi. */
'use strict';
var CACHE = 'nocne-svetlo-v3'; // zvýšiť pri každej zmene digestor.m4a
var PAGE = './';
var SOUND = 'digestor.m4a';
var TIMEOUT_MS = 3000;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // cache: 'reload' → čerstvé súbory zo servera, nie zo zastaranej HTTP cache prehliadača
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll([PAGE, SOUND].map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fromNetwork(req).catch(function () {
      return caches.open(CACHE)
        .then(function (c) { return c.match(PAGE); })
        .then(function (res) { return res || Response.error(); });
    }));
    return;
  }
  if (/\/digestor\.m4a$/.test(new URL(req.url).pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(SOUND).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) c.put(SOUND, res.clone());
          return res;
        });
      });
    }));
  }
});

function fromNetwork(req) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, TIMEOUT_MS);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { return c.put(PAGE, copy); }).catch(function () {});
        resolve(res);
      } else {
        reject(new Error('status ' + (res && res.status)));
      }
    }, function (err) { clearTimeout(timer); reject(err); });
  });
}
