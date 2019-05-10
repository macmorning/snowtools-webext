const context = {
    tabCount: 0,
    collapseThreshold: 5,
    tabs: {}, // array of tabs
    urlFilters: "",
    urlFiltersArr: [],
    knownInstances: {}, // { "url1": "instance 1 name", "url2": "instance 2 name", ...}
    instanceOptions: {}, // { "url1": { "checkState": boolean, "colorSet": boolean, "color": color, "hidden": boolean}, "url2": ...}
    knownNodes: {}
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
const getOptions = () => {
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
                    console.warn("Migrated data to storage.sync");
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
                    console.warn("Initialized data structure in storage.sync");
                });
            }
        } else {
            // remove http:// and https:// from filter string
            const regex = /http[s]{0,1}:\/\//gm;
            const regex2 = /\/[^;]*/gm;
            context.urlFilters = result.urlFilters.replace(regex, "").replace(regex2, "");
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
};

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
    console.log("*SNOW TOOL BELT* Storage update, reloading options");
    getOptions();
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
                    console.log("*SNOW TOOL BELT* Send update message > " + i + " > " + tabs[i].url + " > " + newInstanceOptions[instance]["color"]);
                    chrome.tabs.sendMessage(tabs[i].id, message);
                }
            }
        });
    }
}

/**
 * Message listener
 * @param {Object} message The object send with the message: {command, node}
 * @param {Object} sender The sender tab or window
 * @param {Function} sendResponse
 */
const msgListener = (message, sender, sendResponse) => {
    console.log("*SNOW TOOL BELT* received message");
    console.log(sender);
    console.log(message);
    let hostname;
    try {
        hostname = new URL(sender.url).hostname;
    } catch (e) {
        console.error("Unable to get sender hostname: " + e);
    }

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
    } else if (message.command === "isServiceNow" && sender.url) {
        let matchFound = false;
        context.urlFiltersArr.forEach(function (filter) {
            if (matchFound || filter.trim() === "") return true;
            if (hostname.indexOf(filter.trim()) > -1) {
                let color = "";
                if (context.instanceOptions[hostname] !== undefined) {
                    color = context.instanceOptions[hostname]["color"];
                }
                console.log("*SNOW TOOL BELT* matchFound: " + filter);
                matchFound = true;

                // This is an instance we did not know about, save it
                if (context.knownInstances[hostname] === undefined) {
                    context.knownInstances[hostname] = hostname;
                    context.instanceOptions[hostname] = {};
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

getOptions();
