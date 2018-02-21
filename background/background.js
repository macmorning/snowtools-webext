const isChrome = (chrome !== undefined);

// Configure message listener
var msgListener = function (message, sender, sendResponse) {
    console.log("*SNOW TOOL BELT Background* received message from content script: " + JSON.stringify(message));
    if (message.command === "removeCookie" && message.instance) {
        let targetInstance = message.instance;
        chrome.cookies.remove({"url": "http://" + targetInstance, "name": "BIGipServerpool_" + targetInstance.split(".")[0]}, function (result) {
            sendResponse(true);
        });
        return true;
    }
    sendResponse("");
};

if (isChrome) {
    chrome.runtime.onMessage.addListener(msgListener);
} else {
    browser.runtime.onMessage.addListener(msgListener);
}
