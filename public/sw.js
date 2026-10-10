// ALFRED service worker. No fetch handler and no caching (Alfred is useless
// offline, and a cache is how a PWA gets stuck on an old build). It exists
// for Web Push: show every message, and open the app when one is tapped.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Messages use WebKit's Declarative Web Push shape
// (https://webkit.org/blog/16535/meet-declarative-web-push/):
//   { "web_push": 8030,
//     "notification": { "title", "body", "navigate", "tag", "lang", "dir", "silent", "app_badge" } }
// iOS 18.4+ can show that without this worker; everywhere else (and on iOS
// when a worker is installed) this handler shows it instead. It must ALWAYS
// show something: iOS can revoke a subscription after a push that shows
// nothing, so a message that won't parse still produces a plain notification.
self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event) {
  let n = {};
  try {
    const msg = event.data ? event.data.json() : null;
    if (msg && typeof msg.notification === 'object' && msg.notification) n = msg.notification;
  } catch {
    /* not JSON — fall through to the plain notification */
  }

  const title = typeof n.title === 'string' && n.title ? n.title : 'Alfred';
  const options = {
    body: typeof n.body === 'string' ? n.body : '',
    data: { url: sameOriginUrl(n.navigate) },
  };
  if (typeof n.tag === 'string' && n.tag) options.tag = n.tag;
  if (typeof n.lang === 'string') options.lang = n.lang;
  if (n.dir === 'ltr' || n.dir === 'rtl' || n.dir === 'auto') options.dir = n.dir;
  if (typeof n.silent === 'boolean') options.silent = n.silent;

  try {
    await self.registration.showNotification(title, options);
  } catch {
    // an option this browser rejects must not cost us the notification
    await self.registration.showNotification(title, { body: options.body, data: options.data });
  }
}

/** The navigate URL if it is this app's own, else the app's home. */
function sameOriginUrl(raw) {
  if (typeof raw === 'string' && raw) {
    try {
      const url = new URL(raw, self.location.origin);
      if (url.origin === self.location.origin) return url.href;
    } catch {
      /* malformed */
    }
  }
  return new URL('/home', self.location.origin).href;
}

// Tap: focus an open Alfred window and send it to the URL; otherwise open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(openOrFocus(url));
});

async function openOrFocus(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const win = windows.find((c) => new URL(c.url).origin === self.location.origin);
  if (win) {
    try {
      const focused = await win.focus();
      if (focused.url !== url) await focused.navigate(url);
      return;
    } catch {
      /* an uncontrolled window can't be navigated from here — open a fresh one */
    }
  }
  await self.clients.openWindow(url);
}
