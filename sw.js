// Service worker: lưu sẵn trang và thư viện trong máy để mở app là hiện ngay.
// Trang luôn thử lấy bản mới trên mạng trước (tối đa 3 giây), mạng yếu/mất thì dùng bản đã lưu.
// Số liệu MQTT KHÔNG đi qua đây (WebSocket), nên luôn là số mới nhất.
const CACHE = "dien-nang-v15";
const FILES = ["./", "index.html", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png",
               "https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // chỉ lưu trang này và thư viện; KHÔNG đụng tới máy chủ đo tốc độ (dữ liệu đo rất lớn, phải lấy thẳng từ mạng)
  if (url.origin !== self.location.origin && url.hostname !== "cdnjs.cloudflare.com") return;
  if (req.mode === "navigate" || url.pathname.endsWith(".html")) {
    // trang chính: ưu tiên bản mới, quá 3 giây hoặc mất mạng thì dùng bản đã lưu
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"));
      const timer = setTimeout(() => { if (!done) fallback().then(r => { if (r && !done) { done = true; resolve(r); } }); }, 3000);
      fetch(req).then(r => {
        if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        if (!done) { done = true; clearTimeout(timer); resolve(r); }
      }).catch(() => fallback().then(r => { if (!done) { done = true; clearTimeout(timer); resolve(r || Response.error()); } }));
    }));
    return;
  }
  // icon, thư viện: dùng bản đã lưu ngay, đồng thời cập nhật ngầm
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
