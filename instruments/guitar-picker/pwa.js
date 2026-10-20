// PWA bootstrap (classic script, safe on file://). Over http(s) it links the manifest and
// registers the service worker so the app installs and runs offline; on file:// both are
// skipped because browsers don't support them there (the single-file build needs neither).
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  if (!document.querySelector('link[rel="manifest"]')) {
    var l = document.createElement("link");
    l.rel = "manifest"; l.href = "manifest.json";
    document.head.appendChild(l);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
