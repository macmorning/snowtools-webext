function sendSessionIdToContentScript() {
  window.postMessage({
    direction: "from-page-script",
    message: g_ck
  }, "*");
}
console.warn(">>>>>> " + g_ck);
sendSessionIdToContentScript();
