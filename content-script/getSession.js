sendSessionIdToContentScript = () => {
  window.postMessage({
    direction: "from-snow-page-script",
    message: (g_ck !== undefined ? g_ck : "")
  }, "*");
}

sendSessionIdToContentScript();
