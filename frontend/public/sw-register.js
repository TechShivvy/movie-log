// Feature-detected and deferred to window.load so it never competes with the
// app's own initial bundle fetch/parse. Extracted from an inline <script> in
// index.html into its own file so the page's CSP can use a strict
// script-src 'self' with no 'unsafe-inline' exception.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (err) {
      console.error("Service worker registration failed:", err);
    });
  });
}
