const context = {
    urlFilters: "",
    urlFiltersArr: [],
    instanceOptions: {},
    knownInstances: {}
};

/**
 * Retrieves saved options
 */
function getOptions () {
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
                    console.log("Initialized data in storage.sync");
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
 * Saves the known instances; called after the open tabs have been parsed
 */
function saveKnownInstances () {
    chrome.storage.sync.set({"knownInstances": JSON.stringify(context.knownInstances)}, function (result) {
        console.log("instances saved");
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
 * Rebuild the knownInstances from the object returned by sortProperties.
 * @param {Array} arr array of items in [[key,value],[key,value],...] format.
 */
function sortInstances (arr) {
    context.knownInstances = {};
    arr.forEach(function (item) {
        context.knownInstances[item[0]] = item[1];
    });
}

/**
 * Sort object properties (only own properties will be sorted).
 * https://gist.github.com/umidjons/9614157
 * @author umidjons
 * @param {object} obj object to sort properties
 * @param {bool} isNumericSort true - sort object properties as numeric value, false - sort as string value.
 * @returns {Array} array of items in [[key,value],[key,value],...] format.
 */
function sortProperties (obj, isNumericSort) {
    isNumericSort = isNumericSort || false; // by default text sort
    var sortable = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) { sortable.push([key, obj[key]]); }
    }
    if (isNumericSort) {
        sortable.sort(function (a, b) {
            return a[1] - b[1];
        });
    } else {
        sortable.sort(function (a, b) {
            let x = a[1].toLowerCase();
            let y = b[1].toLowerCase();
            return x < y ? -1 : x > y ? 1 : 0;
        });
    }
    return sortable; // array in format [ [ key1, val1 ], [ key2, val2 ], ... ]
}

/**
 * Handles a change event coming from storage
 * @param {Object} e the event itself
 */
function storageEvent (objChanged, area) {
    console.log("*SNOW TOOL BELT Background* Storage update, reloading options from area ", area);
    getOptions();
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
