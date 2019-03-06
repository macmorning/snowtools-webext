const context = {
    urlFilters: "",
    urlFiltersArr: [],
    instanceOptions: {},
    knownInstances: {}
};

/**
 * Saves context into storage sync area
 */
function saveContext () {
    chrome.storage.sync.set({
        "knownInstances": JSON.stringify(context.knownInstances),
        "instanceOptions": JSON.stringify(context.instanceOptions),
        "urlFilters": context.urlFilters
    }, function () {
        console.log("Options saved!");
    });
}

/**
 * Retrieves saved options
 */
function loadContext () {
    chrome.storage.sync.get(["urlFilters", "knownInstances", "instanceOptions"], (result) => {
        if (Object.keys(result).length === 0) {
            if (localStorage.urlFilters !== undefined) {
                // Nothing is stored inside storage.sync; but we have something in localStorage, migrate to sync
                context.urlFilters = localStorage.urlFilters;
                context.knownInstances = localStorage.knownInstances;
                context.instanceOptions = localStorage.instanceOptions;
                chrome.storage.sync.set({
                    "knownInstances": context.knownInstances,
                    "instanceOptions": context.instanceOptions,
                    "urlFilters": context.urlFilters
                }, function () {
                    console.log("Migrated data to storage.sync");
                });
            } else {
                // Nothing is stored in localStorage nor in sync area
                context.urlFilters = "service-now.com";
                context.knownInstances = "{}";
                context.instanceOptions = "{}";
                chrome.storage.sync.set({
                    "knownInstances": context.knownInstances,
                    "instanceOptions": context.instanceOptions,
                    "urlFilters": context.urlFilters
                }, function () {
                    console.log("Initialized data structure in storage.sync");
                });
            }
        } else {
            context.urlFilters = result.urlFilters;
            context.knownInstances = result.knownInstances;
            context.instanceOptions = result.instanceOptions;
        }

        context.urlFiltersArr = context.urlFilters.split(";");
        try {
            context.knownInstances = JSON.parse(context.knownInstances);
        } catch (e) {
            console.log(e);
            context.knownInstances = {};
        }
        try {
            context.instanceOptions = JSON.parse(context.instanceOptions);
        } catch (e) {
            console.log(e);
            context.instanceOptions = {};
        }
        console.log(context);
    });
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
 * @param {Object} objChanged an object that contains the items that changed with newValue and oldValue
 * @param {String} area Storage area (should be "sync")
 */
function storageEvent (objChanged, area) {
    console.log("*SNOW TOOL BELT Background* Storage update, reloading options from area", area);
    loadContext();
    // instanceOptions changed, send an update message to content scripts
    if (objChanged.instanceOptions !== undefined) {
        let newInstanceOptions = JSON.parse(objChanged.instanceOptions.newValue);
        let oldInstanceOptions = JSON.parse(objChanged.instanceOptions.oldValue);
        chrome.tabs.query({}, function (tabs) {
            for (var i = 0; i < tabs.length; ++i) {
                let instance = tabs[i].url.toString().split("/")[2];
                console.log(instance);
                console.log(newInstanceOptions);
                console.log(newInstanceOptions[instance]);
                if (instance && newInstanceOptions[instance] !== undefined && newInstanceOptions[instance]["color"] !== oldInstanceOptions[instance]["color"]) {
                    let message = {"command": "updateFavicon", "color": newInstanceOptions[instance]["color"] || ""};
                    console.log("*SNOW TOOL BELT Background* Send update message > " + i + " > " + tabs[i].url + " > " + newInstanceOptions[instance]["color"]);
                    chrome.tabs.sendMessage(tabs[i].id, message);
                }
            }
        });
    }
}

// Configure message listener
var msgListener = function (message, sender, sendResponse) {
    console.log("*SNOW TOOL BELT Background* received message from content script: " + JSON.stringify(message));
    if (message.command === "removeCookie" && message.instance) {
        let targetInstance = message.instance;
        chrome.cookies.getAll({"url": "https://" + targetInstance}, function (cookiesArray) {
            cookiesArray.forEach(function (cookie) {
                if (cookie.name.indexOf("BIGipServerpool") > -1 || cookie.name.indexOf("JSESSIONID") > -1 || cookie.name.indexOf("X-Mapping") > -1) {
                    chrome.cookies.remove({"url": "https://" + targetInstance, "name": cookie.name});
                }
            });
        });
        sendResponse(true);
        return true;
    } else if (message.command === "isServiceNow" && message.url) {
        console.log("*SNOW TOOL BELT Background* urlFilters: " + context.urlFilters);
        let matchFound = false;
        context.urlFiltersArr.forEach(function (filter) {
            if (matchFound || filter.trim() === "") return true;
            if (message.url.toString().indexOf(filter.trim()) > -1) {
                let color = "";
                if (context.instanceOptions[message.url] !== undefined) {
                    color = context.instanceOptions[message.url]["color"];
                }
                console.log("*SNOW TOOL BELT Background* matchFound: " + filter);
                matchFound = true;

                // This is an instance we did not know about, save it
                if (context.knownInstances[message.url] === undefined) {
                    context.knownInstances[message.url] = message.url;
                    context.instanceOptions[message.url] = {};
                    console.log(context.knownInstances);
                    saveContext();
                }

                let response = { "isServiceNow": true, "favIconColor": color };
                console.log(response);
                sendResponse(response);
            }
        });
        sendResponse({ "isServiceNow": false });
    }
    sendResponse("");
};

chrome.runtime.onMessage.addListener(msgListener);
chrome.tabs.onUpdated.addListener(tabUpdated);
chrome.storage.onChanged.addListener(storageEvent);

loadContext();
