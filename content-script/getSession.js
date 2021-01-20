sendSessionIdToContentScript = () => {
  try {
      if (g_ck) {
      window.postMessage({
        direction: "from-snow-page-script",
        message: g_ck
      }, "*");
    }
  } catch(e) {}
}

sendSessionIdToContentScript();
