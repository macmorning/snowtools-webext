const isChrome = (chrome !== undefined);
const context = {
    urlFilters: "",
    urlFiltersArr: [],
    instanceOptions: {}
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
        try {
            context.instanceOptions = JSON.parse(localStorage.instanceOptions);
        } catch (e) {
            console.log("*SNOW TOOL BELT Background* could not parse the saved data, perhaps someone messed with it?");
            context.instanceOptions = {};
        }
    }
}

/**
 * Reflects changes that occur on tabs
 * @param {Integer} tabId the id of the updated tab
 * @param {Object} changeInfo contains the informations that changed
 * @param {Tab} tab the Tab object itself
 */
function tabUpdated (tabId, changeInfo, tab) {
    let instance = tab.url.split("/")[2];
    if (changeInfo.favIconUrl !== undefined) {
        if (context.instanceOptions[instance] !== undefined && context.instanceOptions[instance]["color"]) {
            chrome.tabs.sendMessage(tabId, {"command": "updateFavicon", "color": context.instanceOptions[instance]["color"]});
        }
    }
}

/**
 * Handles a change event coming from storage
 * @param {Object} e the event itself
 */
function storageEvent (e) {
    console.log("*SNOW TOOL BELT Background* Storage update, reloading options");
    getOptions();
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
                let instance = message.url.split("/")[2];
                let color = "";
                if (context.instanceOptions[instance] !== undefined) {
                    color = context.instanceOptions[instance]["color"];
                }
                console.log("*SNOW TOOL BELT Background* matchFound: " + filter);
                matchFound = true;
                sendResponse({ "isServiceNow": true, "favIconColor": color });
            }
        });
        sendResponse({ "isServiceNow": false });
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

if (window.addEventListener) {
    addEventListener("storage", storageEvent, false);
} else if (window.attachEvent) {
    attachEvent("onstorage", storageEvent, false);
}
