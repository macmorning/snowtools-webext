const isChrome = (chrome !== undefined);
const context = {
    urlFilters: "",
    urlFiltersArr: []
};

/**
 * Retrieves saved options
 */
function getOptions () {
    context.urlFilters = "service-now.com";
    context.urlFiltersArr = ["service-now.com"];
    if (typeof (Storage) !== "undefined") {
        context.urlFilters = localStorage.urlFilters || "service-now.com";
        context.urlFiltersArr = context.urlFilters.split(";");
    }
}

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
function tabUpdated (tabId, changeInfo, tab) {
    if (changeInfo.favIconUrl !== undefined) {
        chrome.tabs.sendMessage(tabId, {"command": "updateFavicon", "url": changeInfo.favIconUrl, "color": "#0ab"});
    }
}

// Configure message listener
var msgListener = function (message, sender, sendResponse) {
    console.log("*SNOW TOOL BELT Background* received message from content script: " + JSON.stringify(message));
    if (message.command === "removeCookie" && message.instance) {
        let targetInstance = message.instance;
        chrome.cookies.remove({"url": "http://" + targetInstance, "name": "BIGipServerpool_" + targetInstance.split(".")[0]}, function (result) {
            sendResponse(true);
        });
        return true;
    } else if (message.command === "isServiceNow" && message.url) {
        getOptions();
        console.log("*SNOW TOOL BELT Background* urlFilters: " + context.urlFilters);
        let matchFound = false;
        context.urlFiltersArr.forEach(function (filter) {
            if (matchFound || filter.trim() === "") return true;
            if (message.url.toString().indexOf(filter.trim()) > -1) {
                console.log("*SNOW TOOL BELT Background* matchFound: " + filter);
                matchFound = true;
                sendResponse(true);
            }
        });
        sendResponse(false);
    }
    sendResponse("");
};

if (isChrome) {
    chrome.runtime.onMessage.addListener(msgListener);
    chrome.tabs.onUpdated.addListener(tabUpdated);
} else {
    browser.runtime.onMessage.addListener(msgListener);
    browser.tabs.onUpdated.addListener(tabUpdated);
}
