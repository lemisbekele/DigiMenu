self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let payload = {
    body: "DigiMenu has an update.",
    title: "DigiMenu",
    url: "/",
  }

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      payload.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      badge: "/favicon.svg",
      data: {
        url: payload.url || "/",
      },
      icon: "/favicon.svg",
      requireInteraction: Boolean(payload.requireInteraction),
      tag: payload.tag || "digimenu-update",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin)

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      const existingClient = clients.find((client) => {
        const clientUrl = new URL(client.url)
        return clientUrl.origin === targetUrl.origin && clientUrl.pathname === targetUrl.pathname
      })
      if (existingClient) {
        return existingClient.navigate(targetUrl.href).then((client) => (client || existingClient).focus())
      }
      return self.clients.openWindow(targetUrl.href)
    }),
  )
})
