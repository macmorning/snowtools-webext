const isChrome = (typeof browser === "undefined");
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
    context.urlFilters = "service-now.com";
    context.urlFiltersArr = ["service-now.com"];
    if (typeof (Storage) !== "undefined") {
        context.urlFilters = localStorage.urlFilters || "service-now.com";
        context.urlFiltersArr = context.urlFilters.split(";");
        try {
            context.knownInstances = JSON.parse(localStorage.knownInstances);
        } catch (e) {
            context.knownInstances = {};
            console.log(e);
        }
        try {
            context.instanceOptions = JSON.parse(localStorage.instanceOptions);
        } catch (e) {
            console.log("*SNOW TOOL BELT Background* could not parse the saved data, perhaps someone messed with it?");
            context.instanceOptions = {};
        }
    }
}

/**
 * Saves the known instances; called after the open tabs have been parsed
 */
function saveKnownInstances () {
    if (typeof (Storage) !== "undefined") {
        localStorage.knownInstances = JSON.stringify(context.knownInstances);
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
function storageEvent (e) {
    console.log("*SNOW TOOL BELT Background* Storage update, reloading options");
    getOptions();
    chrome.tabs.query({}, function (tabs) {
        for (var i = 0; i < tabs.length; ++i) {
            let instance = tabs[i].url.toString().split("/")[2];
            if (instance && context.instanceOptions[instance] !== undefined) {
                let message = {"command": "updateFavicon", "color": context.instanceOptions[instance]["color"] || ""};
                console.log("*SNOW TOOL BELT Background* Send update message > " + i + " > " + tabs[i].url + " > " + context.instanceOptions[instance]["color"]);
                chrome.tabs.sendMessage(tabs[i].id, message);
            }
        }
    });
    sortInstances(sortProperties(context.knownInstances, false));
    saveKnownInstances();
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

getOptions();
