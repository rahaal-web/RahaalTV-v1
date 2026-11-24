/* RahaL TV Web Push Service Worker Add-on (integrated via Workbox importScripts & dev testing) */

function sanitizeInternalPushTarget(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '#/';
  var trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 300 || /[\r\n\\]/.test(trimmed)) return '#/';
  if (/^(?:https?:|javascript:|data:|vbscript:|file:|mailto:|tel:|\/\/)/i.test(trimmed)) {
    return '#/';
  }
  if (trimmed === '#' || trimmed === '/') return '#/';
  if (trimmed.indexOf('#/') === 0) return trimmed;
  if (trimmed.indexOf('/') === 0) return '#' + trimmed;
  return '#/';
}

function resolveScopedTargetUrl(rawInternalHash) {
  var safeHash = sanitizeInternalPushTarget(rawInternalHash);
  var scopeUrl = (self.registration && self.registration.scope) || (self.location && self.location.origin + '/') || '/';
  var baseUrl = scopeUrl.replace(/\/+$/, '') + '/';
  return new URL(safeHash, baseUrl).toString();
}

self.addEventListener('push', function (event) {
  var payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch (e) {
      try {
        payload = { body: event.data.text() };
      } catch (err2) {
        payload = {};
      }
    }
  }

  var title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'RahaL TV';
  var body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : 'تحديث جديد متوفر الآن على RahaL TV';
  var safeHash = sanitizeInternalPushTarget(payload.url);
  var scopeBase = ((self.registration && self.registration.scope) || '/').replace(/\/+$/, '') + '/';
  var iconUrl = new URL('pwa-192x192.png', scopeBase).toString();

  var options = {
    body: body,
    icon: iconUrl,
    badge: iconUrl,
    dir: 'rtl',
    lang: 'ar',
    tag: typeof payload.tag === 'string' && payload.tag ? payload.tag : 'rahaltv-push',
    data: {
      url: safeHash,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var rawUrl =
    event.notification && event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '#/';
  var safeHash = sanitizeInternalPushTarget(rawUrl);
  var targetFullUrl = resolveScopedTargetUrl(safeHash);
  var scopeOrigin = self.location.origin;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url && client.url.indexOf(scopeOrigin) === 0) {
            if (typeof client.focus === 'function') {
              return client.focus().then(function (focusedClient) {
                var targetClient = focusedClient || client;
                if (targetClient && typeof targetClient.postMessage === 'function') {
                  targetClient.postMessage({
                    type: 'RTV_PUSH_NAVIGATE',
                    url: safeHash,
                  });
                }
                return targetClient;
              });
            }
          }
        }
        if (self.clients && typeof self.clients.openWindow === 'function') {
          return self.clients.openWindow(targetFullUrl);
        }
        return undefined;
      })
  );
});
