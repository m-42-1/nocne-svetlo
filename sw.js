/* Nočné svetlo – offline kópia stránky a zvuku digestora.
   Stránka: najprv sieť (nová verzia sa načíta hneď); ak sieť do 3 s neodpovie, použije sa uložená kópia.
   Zvuk digestora: z uloženej kópie (nemení sa), inak zo siete.
   Vďaka tomu sa appka otvorí, aj keď ju iOS znova načíta v čase výpadku Wi-Fi. */
'use strict';
// Prípona = prvých 8 znakov SHA-256 súboru digestor.m4a (test to stráži) → nový zvuk = nová cache.
var PREFIX = 'nocne-svetlo-';
var CACHE = PREFIX + '576f832c';
var PAGE = './';
var SOUND = 'digestor.m4a';
var TIMEOUT_MS = 3000;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // cache: 'reload' → čerstvé súbory zo servera, nie zo zastaranej HTTP cache prehliadača.
  // Chyba sa neprehĺta: neúspešná inštalácia nechá bežať starý SW aj s jeho offline kópiou.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll([PAGE, SOUND].map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (e) {
  // len vlastné staré cache – iné appky na rovnakej doméne (m-42-1.github.io) majú svoje
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/** Samotná stránka appky (rozsah SW alebo index.html), nie iný súbor otvorený v Safari. */
function isAppPage(url) {
  var scope = new URL(self.registration.scope).pathname;
  return url.pathname === scope || url.pathname === scope + 'index.html';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate') {
    if (!isAppPage(url)) return; // napr. otvorený digestor.m4a – bez zásahu, offline kópia ostane
    e.respondWith(fromNetwork(req).catch(function () {
      return caches.open(CACHE)
        .then(function (c) { return c.match(PAGE); })
        .then(function (res) { return res || Response.error(); });
    }));
    return;
  }
  if (/\/digestor\.m4a$/.test(url.pathname)) {
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

function isHtml(res) {
  return (res.headers.get('content-type') || '').indexOf('text/html') === 0;
}

function fromNetwork(req) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, TIMEOUT_MS);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.type === 'opaqueredirect') {
        resolve(res); // presmerovanie (napr. nová adresa) pustí prehliadač ďalej; neukladať
      } else if (res && res.ok) {
        if (isHtml(res)) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { return c.put(PAGE, copy); }).catch(function () {});
        }
        resolve(res);
      } else {
        reject(new Error('status ' + (res && res.status)));
      }
    }, function (err) { clearTimeout(timer); reject(err); });
  });
}
