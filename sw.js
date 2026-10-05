/* Nočné svetlo – offline kópia stránky.
   Najprv sieť (nová verzia sa načíta hneď); ak sieť do 3 s neodpovie, použije sa uložená kópia.
   Vďaka tomu sa stránka otvorí, aj keď ju iOS znova načíta v čase výpadku Wi-Fi. */
'use strict';
var CACHE = 'nocne-svetlo-v1';
var PAGE = './';
var TIMEOUT_MS = 3000;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.add(PAGE); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  e.respondWith(fromNetwork(req).catch(function () {
    return caches.open(CACHE)
      .then(function (c) { return c.match(PAGE); })
      .then(function (res) { return res || Response.error(); });
  }));
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
