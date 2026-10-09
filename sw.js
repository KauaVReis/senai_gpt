const CACHE_NAME = 'inova-senai-v4';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './img/SENAI-AI 1.png',
    './img/senai_logo.png',
    './js/app.js',
    './js/config.js',
    './js/db.js',
    './js/api.js',
    './js/ui.js',
    './js/canvas.js',
    './js/python-runner.js',
    './js/katex-render.js',
    './js/speech.js'
];

// Install
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS).catch(err => {
                console.warn('[SW] Falha não impeditiva ao pré-armazenar assets:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — Network first, fallback to cache
self.addEventListener('fetch', (e) => {
    // Não cacheia chamadas de IA ou CDNs de terceiros
    if (e.request.url.includes('googleapis.com') ||
        e.request.url.includes('openrouter.ai') ||
        e.request.url.includes('pyodide')) {
        return;
    }

    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
